import type { z } from 'zod';
import { manifestSchema, type Manifest } from './schemas/manifest.js';
import { characterIdentitySchema, type CharacterIdentity } from './schemas/character.js';
import { storySchema } from './schemas/story.js';
import { storyGraphSchema } from './schemas/sceneGraph.js';
import { cluesFileSchema, type Clue } from './schemas/clue.js';
import { factsFileSchema, type Fact } from './schemas/fact.js';
import { secretsFileSchema, type Secret } from './schemas/secret.js';
import { SEED_CHAT_PLAYER_SPEAKER } from './schemas/seedChat.js';
import { CURRENT_PLAYER_VERSION, SUPPORTED_FORMAT_MAJOR } from './player-version.js';
import { compareSemver, parseSemver } from './semver.js';

export type PackageValidationErrorCode =
	| 'MISSING_FILE'
	| 'SCHEMA_ERROR'
	| 'UNSUPPORTED_FORMAT_VERSION'
	| 'PLAYER_TOO_OLD'
	| 'DUPLICATE_ID'
	| 'DANGLING_REFERENCE'
	| 'FILENAME_ID_MISMATCH';

export interface PackageValidationError {
	code: PackageValidationErrorCode;
	/** e.g. "manifest.json#/minPlayerVersion" or "story/story.json#/castBindings/2/characterRef" */
	path: string;
	message: string;
}

export interface PackageValidationResult {
	valid: boolean;
	errors: PackageValidationError[];
	manifest?: Manifest;
	/** Parsed world/story content, present whenever the corresponding file parsed successfully. */
	story?: z.infer<typeof storySchema>;
	graph?: z.infer<typeof storyGraphSchema>;
	/** Flattened across every `manifest.world` entry matching the respective filename suffix. */
	clues?: Clue[];
	facts?: Fact[];
	secrets?: Secret[];
	/** Every successfully-parsed `manifest.characters` entry, for the installer's #characters hand-off. */
	characters?: CharacterIdentity[];
}

export interface ValidatePackageOptions {
	playerVersion?: string;
}

const CHARACTER_FILENAME_RE = /(?:^|\/)([0-9a-f-]{36})\.character\.json$/i;

function zodIssuesToErrors(filePath: string, error: z.ZodError): PackageValidationError[] {
	return error.issues.map((issue) => ({
		code: 'SCHEMA_ERROR',
		path: `${filePath}#/${issue.path.join('/')}`,
		message: `${filePath}: ${issue.message} at "${issue.path.join('.') || '(root)'}"`
	}));
}

interface ParsedWorldFile<T> {
	path: string;
	data: T[];
}

/** Parses every `manifest.world` entry whose filename ends with `suffix` against `schema`. */
function parseWorldFiles<T>(
	manifestWorld: string[],
	files: Record<string, unknown>,
	suffix: string,
	schema: z.ZodType<T[]>,
	errors: PackageValidationError[]
): ParsedWorldFile<T>[] {
	const parsed: ParsedWorldFile<T>[] = [];
	for (const worldPath of manifestWorld) {
		if (!worldPath.endsWith(suffix) || files[worldPath] === undefined) continue;
		const result = schema.safeParse(files[worldPath]);
		if (!result.success) {
			errors.push(...zodIssuesToErrors(worldPath, result.error));
			continue;
		}
		parsed.push({ path: worldPath, data: result.data });
	}
	return parsed;
}

function checkDuplicateIds(
	parsedFiles: ParsedWorldFile<{ id: string }>[],
	label: string,
	errors: PackageValidationError[]
): void {
	for (const { path, data } of parsedFiles) {
		const seenIds = new Set<string>();
		for (const item of data) {
			if (seenIds.has(item.id)) {
				errors.push({
					code: 'DUPLICATE_ID',
					path: `${path}#/`,
					message: `${label} id "${item.id}" is declared more than once`
				});
			}
			seenIds.add(item.id);
		}
	}
}

/** Verifies every character-uuid in `getRefs(item)` matches a shipped character file. */
function checkCharacterRefs<T>(
	parsedFiles: ParsedWorldFile<T & { id: string }>[],
	getRefs: (item: T) => string[],
	fieldName: string,
	parsedCharacterIds: Set<string>,
	errors: PackageValidationError[]
): void {
	for (const { path, data } of parsedFiles) {
		data.forEach((item, index) => {
			for (const characterId of getRefs(item)) {
				if (!parsedCharacterIds.has(characterId)) {
					errors.push({
						code: 'DANGLING_REFERENCE',
						path: `${path}#/${index}/${fieldName}`,
						message: `${fieldName} references character "${characterId}" with no shipped character file`
					});
				}
			}
		});
	}
}

/**
 * Strips any number of `not:` wrappers, so a condition is checked by what it actually names.
 * Mirrors `engine/conditions.ts`'s recursion into `not:`.
 */
function unwrapNegation(ref: string): string {
	let current = ref;
	while (current.startsWith('not:')) current = current.slice('not:'.length);
	return current;
}

/**
 * Reports conditions that name a package entity which does not exist — a condition whose
 * referent is missing can never become true, so the achievement or ending hanging off it is
 * silently unreachable (#32).
 *
 * Prefixes this player does not know are deliberately *not* reported: `engine/conditions.ts`
 * treats an unknown prefix as `false` rather than throwing precisely so a newer package stays
 * installable, and failing validation here would undo that.
 */
function checkConditionRefs(
	conditions: readonly string[],
	pathPrefix: string,
	known: {
		sceneIds: ReadonlySet<string>;
		clueIds: ReadonlySet<string>;
		secretIds: ReadonlySet<string>;
		outcomeIds: ReadonlySet<string>;
	},
	errors: PackageValidationError[]
): void {
	conditions.forEach((rawRef, index) => {
		const ref = unwrapNegation(rawRef);
		const colonIndex = ref.indexOf(':');
		if (colonIndex === -1) return;
		const prefix = ref.slice(0, colonIndex);
		const rest = ref.slice(colonIndex + 1);

		let missing: string | undefined;
		switch (prefix) {
			case 'scene-unlocked':
			case 'scene-completed':
				if (!known.sceneIds.has(rest)) missing = `scene "${rest}"`;
				break;
			case 'clue-known':
			case 'clue-resolved':
				if (!known.clueIds.has(rest)) missing = `clue "${rest}"`;
				break;
			case 'clue-confirmed': {
				// "clue-confirmed:<clueId>:<count>" — the count is the last segment.
				const lastColon = rest.lastIndexOf(':');
				const clueId = lastColon === -1 ? rest : rest.slice(0, lastColon);
				if (!known.clueIds.has(clueId)) missing = `clue "${clueId}"`;
				break;
			}
			case 'secret-revealed':
				if (!known.secretIds.has(rest)) missing = `secret "${rest}"`;
				break;
			case 'outcome-reached':
				if (!known.outcomeIds.has(rest)) missing = `outcome "${rest}"`;
				break;
		}
		if (missing !== undefined) {
			errors.push({
				code: 'DANGLING_REFERENCE',
				path: `${pathPrefix}/${index}`,
				message: `condition "${rawRef}" references ${missing}, which this package does not declare`
			});
		}
	});
}

/**
 * Validates a fully-unpacked story package. `files` maps manifest-relative paths to
 * already-JSON.parse'd content — parsing raw ZIP bytes is a loader concern outside this
 * function. Never throws; every problem becomes a specific, actionable
 * PackageValidationError. Errors accumulate across steps rather than failing fast, so a
 * single call surfaces every problem an author needs to fix.
 */
export function validatePackage(
	files: Record<string, unknown>,
	options: ValidatePackageOptions = {}
): PackageValidationResult {
	const errors: PackageValidationError[] = [];
	const playerVersion = options.playerVersion ?? CURRENT_PLAYER_VERSION;

	// Step 1: manifest presence + schema.
	const rawManifest = files['manifest.json'];
	if (rawManifest === undefined) {
		return {
			valid: false,
			errors: [
				{
					code: 'MISSING_FILE',
					path: 'manifest.json',
					message: 'manifest.json is required and was not found in the package'
				}
			]
		};
	}

	const manifestResult = manifestSchema.safeParse(rawManifest);
	if (!manifestResult.success) {
		return { valid: false, errors: zodIssuesToErrors('manifest.json', manifestResult.error) };
	}
	const manifest = manifestResult.data;

	// Step 2: format/version compatibility.
	const formatVersion = parseSemver(manifest.formatVersion)!;
	if (formatVersion.major !== SUPPORTED_FORMAT_MAJOR) {
		errors.push({
			code: 'UNSUPPORTED_FORMAT_VERSION',
			path: 'manifest.json#/formatVersion',
			message: `formatVersion "${manifest.formatVersion}" is not supported (expected major version ${SUPPORTED_FORMAT_MAJOR})`
		});
	}
	const minPlayerVersion = parseSemver(manifest.minPlayerVersion)!;
	const runningPlayerVersion = parseSemver(playerVersion);
	if (!runningPlayerVersion || compareSemver(minPlayerVersion, runningPlayerVersion) > 0) {
		errors.push({
			code: 'PLAYER_TOO_OLD',
			path: 'manifest.json#/minPlayerVersion',
			message: `this package requires player >= ${manifest.minPlayerVersion}, installed player is ${playerVersion}`
		});
	}

	// Step 3: required files present.
	const requiredPaths = [
		manifest.entryStory,
		manifest.entryGraph,
		...manifest.characters,
		...manifest.world
	];
	for (const path of requiredPaths) {
		if (files[path] === undefined) {
			errors.push({
				code: 'MISSING_FILE',
				path: `manifest.json#/${path}`,
				message: `referenced file "${path}" is missing from the package`
			});
		}
	}

	// Step 4: parse story/graph/clues/facts/secrets (only when present — absence already reported).
	let story: z.infer<typeof storySchema> | undefined;
	if (files[manifest.entryStory] !== undefined) {
		const storyResult = storySchema.safeParse(files[manifest.entryStory]);
		if (!storyResult.success) {
			errors.push(...zodIssuesToErrors(manifest.entryStory, storyResult.error));
		} else {
			story = storyResult.data;
		}
	}

	let graph: z.infer<typeof storyGraphSchema> | undefined;
	if (files[manifest.entryGraph] !== undefined) {
		const graphResult = storyGraphSchema.safeParse(files[manifest.entryGraph]);
		if (!graphResult.success) {
			errors.push(...zodIssuesToErrors(manifest.entryGraph, graphResult.error));
		} else {
			graph = graphResult.data;
		}
	}

	const parsedClueFiles = parseWorldFiles(
		manifest.world,
		files,
		'clues.json',
		cluesFileSchema,
		errors
	);
	const parsedFactFiles = parseWorldFiles(
		manifest.world,
		files,
		'facts.json',
		factsFileSchema,
		errors
	);
	const parsedSecretFiles = parseWorldFiles(
		manifest.world,
		files,
		'secrets.json',
		secretsFileSchema,
		errors
	);

	// Step 5: parse character files; verify filename-embedded uuid matches the declared id.
	const parsedCharacterIds = new Set<string>();
	const characterIdOrigins = new Map<string, string>();
	const parsedCharacters: CharacterIdentity[] = [];
	for (const charPath of manifest.characters) {
		if (files[charPath] === undefined) continue; // already reported as MISSING_FILE above
		const charResult = characterIdentitySchema.safeParse(files[charPath]);
		if (!charResult.success) {
			errors.push(...zodIssuesToErrors(charPath, charResult.error));
			continue;
		}
		const character = charResult.data;
		const filenameMatch = CHARACTER_FILENAME_RE.exec(charPath);
		if (filenameMatch && filenameMatch[1].toLowerCase() !== character.id.toLowerCase()) {
			errors.push({
				code: 'FILENAME_ID_MISMATCH',
				path: `${charPath}#/id`,
				message: `filename declares uuid "${filenameMatch[1]}" but id field is "${character.id}"`
			});
		}
		if (characterIdOrigins.has(character.id)) {
			errors.push({
				code: 'DUPLICATE_ID',
				path: `${charPath}#/id`,
				message: `character id "${character.id}" is also declared in "${characterIdOrigins.get(character.id)}"`
			});
		} else {
			characterIdOrigins.set(character.id, charPath);
		}
		parsedCharacterIds.add(character.id);
		parsedCharacters.push(character);
	}

	// Step 6: duplicate-id checks — scene-node ids, clue/fact/secret ids.
	if (graph) {
		const sceneIdOrigins = new Map<string, string>();
		for (const node of graph.nodes) {
			if (sceneIdOrigins.has(node.id)) {
				errors.push({
					code: 'DUPLICATE_ID',
					path: `${manifest.entryGraph}#/nodes`,
					message: `scene id "${node.id}" is declared more than once`
				});
			} else {
				sceneIdOrigins.set(node.id, node.id);
			}
		}
	}

	checkDuplicateIds(parsedClueFiles, 'clue', errors);
	checkDuplicateIds(parsedFactFiles, 'fact', errors);
	checkDuplicateIds(parsedSecretFiles, 'secret', errors);

	// Step 7: referential integrity against the parsed character ids and scene graph.
	if (story) {
		story.castBindings.forEach((binding, index) => {
			if (!parsedCharacterIds.has(binding.characterRef)) {
				errors.push({
					code: 'DANGLING_REFERENCE',
					path: `${manifest.entryStory}#/castBindings/${index}/characterRef`,
					message: `characterRef "${binding.characterRef}" does not match any shipped character file`
				});
			}
			for (const relatedId of Object.keys(binding.relationships)) {
				if (!parsedCharacterIds.has(relatedId)) {
					errors.push({
						code: 'DANGLING_REFERENCE',
						path: `${manifest.entryStory}#/castBindings/${index}/relationships/${relatedId}`,
						message: `relationships references character "${relatedId}" with no shipped character file`
					});
				}
			}
		});
	}

	if (graph) {
		const sceneIds = new Set(graph.nodes.map((node) => node.id));
		graph.nodes.forEach((node, index) => {
			node.participants.forEach((participantId) => {
				if (!parsedCharacterIds.has(participantId)) {
					errors.push({
						code: 'DANGLING_REFERENCE',
						path: `${manifest.entryGraph}#/nodes/${index}/participants`,
						message: `participant "${participantId}" does not match any shipped character file`
					});
				}
			});
			if (node.type === 'chat-scene') {
				node.next.forEach((transition, transitionIndex) => {
					if (!sceneIds.has(transition.target)) {
						errors.push({
							code: 'DANGLING_REFERENCE',
							path: `${manifest.entryGraph}#/nodes/${index}/next/${transitionIndex}/target`,
							message: `next.target "${transition.target}" does not match any scene id in this graph`
						});
					}
				});
			}
		});
	}

	checkCharacterRefs(
		parsedClueFiles,
		(clue) => clue.confirmedBy,
		'confirmedBy',
		parsedCharacterIds,
		errors
	);
	checkCharacterRefs(
		parsedSecretFiles,
		(secret) => secret.heldBy,
		'heldBy',
		parsedCharacterIds,
		errors
	);

	// Step 8: achievement + seed-chat integrity (docs/arc42 §8.1.6, §8.1.8).
	const knownRefs = {
		sceneIds: new Set(graph?.nodes.map((node) => node.id) ?? []),
		clueIds: new Set(parsedClueFiles.flatMap((file) => file.data.map((clue) => clue.id))),
		secretIds: new Set(parsedSecretFiles.flatMap((file) => file.data.map((secret) => secret.id))),
		outcomeIds: new Set(
			(graph?.nodes ?? []).flatMap((node) =>
				node.type === 'group-chat-scene' ? node.outcomes.map((outcome) => outcome.id) : []
			)
		)
	};

	if (story) {
		const achievementIds = new Set<string>();
		story.achievements.forEach((achievement, index) => {
			if (achievementIds.has(achievement.id)) {
				errors.push({
					code: 'DUPLICATE_ID',
					path: `${manifest.entryStory}#/achievements/${index}/id`,
					message: `achievement id "${achievement.id}" is declared more than once`
				});
			}
			achievementIds.add(achievement.id);
			checkConditionRefs(
				achievement.conditions,
				`${manifest.entryStory}#/achievements/${index}/conditions`,
				knownRefs,
				errors
			);
		});

		const seededSceneIds = new Set<string>();
		story.seedChats.forEach((seedChat, index) => {
			const path = `${manifest.entryStory}#/seedChats/${index}`;
			const node = graph?.nodes.find((candidate) => candidate.id === seedChat.sceneRef);
			if (graph && !node) {
				errors.push({
					code: 'DANGLING_REFERENCE',
					path: `${path}/sceneRef`,
					message: `sceneRef "${seedChat.sceneRef}" does not match any scene id in this graph`
				});
			}
			if (seededSceneIds.has(seedChat.sceneRef)) {
				// Two histories for one thread would silently concatenate in authoring order —
				// almost certainly a copy-paste slip rather than an intent.
				errors.push({
					code: 'DUPLICATE_ID',
					path: `${path}/sceneRef`,
					message: `scene "${seedChat.sceneRef}" already has a seed chat`
				});
			}
			seededSceneIds.add(seedChat.sceneRef);

			seedChat.messages.forEach((message, messageIndex) => {
				if (message.from === SEED_CHAT_PLAYER_SPEAKER) return;
				if (node && !node.participants.includes(message.from)) {
					errors.push({
						code: 'DANGLING_REFERENCE',
						path: `${path}/messages/${messageIndex}/from`,
						message: `seed message is from character "${message.from}", who does not take part in scene "${seedChat.sceneRef}"`
					});
				} else if (!parsedCharacterIds.has(message.from)) {
					errors.push({
						code: 'DANGLING_REFERENCE',
						path: `${path}/messages/${messageIndex}/from`,
						message: `seed message is from character "${message.from}" with no shipped character file`
					});
				}
			});
		});
	}

	return {
		valid: errors.length === 0,
		errors,
		manifest,
		story,
		graph,
		clues: parsedClueFiles.length > 0 ? parsedClueFiles.flatMap((f) => f.data) : undefined,
		facts: parsedFactFiles.length > 0 ? parsedFactFiles.flatMap((f) => f.data) : undefined,
		secrets: parsedSecretFiles.length > 0 ? parsedSecretFiles.flatMap((f) => f.data) : undefined,
		characters: parsedCharacters.length > 0 ? parsedCharacters : undefined
	};
}
