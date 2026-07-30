/**
 * The "director" pass: after a character has answered, a second, short model call decides
 * whether the scene's authored exit conditions are now satisfied and which clue claims were
 * actually made. Its verdict is applied through the engine, which is what advances the graph.
 *
 * Why this exists: a story package contains no dialogue and no keyword triggers — a scene only
 * declares `goals`, `exitConditions` (`flag:…`) and `revealables` (`clue:…`/`fact:…`). Something
 * has to translate free conversation into those symbols, and docs/concept.md §9 explicitly
 * leaves the `engine/` ↔ `llm/` interface open. This is that interface.
 *
 * Both halves here are pure so they can be tested in Node without a GPU; the model call itself
 * lives in `state/story-session.svelte.ts`.
 *
 * The parser is deliberately paranoid. A local 3B model will produce prose around its JSON,
 * invent ids, or return nothing at all — none of which may be allowed to move the story. Every
 * id is checked against what the *active scene* declared, so the worst case of a bad answer is
 * "nothing happens", never "some other flag got set".
 */

export interface DirectorScene {
	goals: readonly string[];
	/** `flag:…` refs the scene needs before it completes. Only these can be set. */
	exitConditions: readonly string[];
	/** `clue:…` / `fact:…` refs the scene may reveal. Only the clue refs can be claimed. */
	revealables: readonly string[];
}

export interface DirectorTurn {
	/** Display name for a character, or the player's own label. */
	who: string;
	text: string;
}

export interface DirectorClue {
	id: string;
	label: string;
}

export interface DirectorCharacter {
	id: string;
	name: string;
}

export interface DirectorVerdict {
	flags: string[];
	clues: { id: string; characterId: string; value: string }[];
}

const EMPTY_VERDICT: DirectorVerdict = { flags: [], clues: [] };

/** Only `flag:` refs are settable; a scene may also list `scene-completed:`-style conditions. */
export function settableFlags(scene: DirectorScene): string[] {
	return scene.exitConditions.filter((ref) => ref.startsWith('flag:'));
}

export function claimableClueIds(scene: DirectorScene): string[] {
	return scene.revealables.filter((ref) => ref.startsWith('clue:'));
}

/**
 * The director's instruction. Lists only what this scene declares, so the model is never even
 * shown an id it isn't allowed to pick — the allowlist in `parseDirectorVerdict` then enforces
 * the same thing a second time, on the answer.
 */
export function buildDirectorPrompt(input: {
	scene: DirectorScene;
	clues: readonly DirectorClue[];
	characters: readonly DirectorCharacter[];
	turns: readonly DirectorTurn[];
}): string {
	const flags = settableFlags(input.scene);
	const clueIds = claimableClueIds(input.scene);
	const clueLines = clueIds.map((id) => {
		const label = input.clues.find((clue) => clue.id === id)?.label;
		return label ? `- ${id} — ${label}` : `- ${id}`;
	});
	const characterLines = input.characters.map((c) => `- ${c.id} — ${c.name}`);
	const transcript = input.turns.map((turn) => `${turn.who}: ${turn.text}`).join('\n');

	return [
		'Du bist ein stiller Spielleiter. Du bewertest einen Gesprächsausschnitt und antwortest',
		'ausschließlich mit einem JSON-Objekt, ohne Erklärung, ohne Markdown.',
		'',
		'Format:',
		'{"flags": ["<ref>"], "clues": [{"id": "<clue-ref>", "character": "<uuid>", "value": "<kurze Angabe>"}]}',
		'',
		`Ziele dieser Szene: ${input.scene.goals.join(', ') || '(keine)'}`,
		'',
		'Erlaubte flags (nur setzen, wenn im Gespräch nachweislich erfüllt):',
		...(flags.length > 0 ? flags.map((ref) => `- ${ref}`) : ['(keine)']),
		'',
		'Erlaubte clues (nur eintragen, wenn eine Figur eine konkrete Angabe gemacht hat):',
		...(clueLines.length > 0 ? clueLines : ['(keine)']),
		'',
		'Figuren:',
		...(characterLines.length > 0 ? characterLines : ['(keine)']),
		'',
		'Gespräch:',
		transcript,
		'',
		'Nichts erfüllt? Dann antworte genau: {"flags": [], "clues": []}'
	].join('\n');
}

/** Extracts the first balanced `{…}` block, so prose around the JSON doesn't defeat the parse. */
function firstJsonObject(raw: string): string | null {
	const start = raw.indexOf('{');
	if (start === -1) return null;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < raw.length; i++) {
		const char = raw[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '{') depth++;
		else if (char === '}' && --depth === 0) return raw.slice(start, i + 1);
	}
	return null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null
	);
}

/**
 * Parses the model's answer and drops everything the scene didn't declare. Returns an empty
 * verdict for anything unparseable — a director that can't be understood must not be able to
 * move the story.
 */
export function parseDirectorVerdict(
	raw: string,
	allowed: {
		flags: readonly string[];
		clueIds: readonly string[];
		characterIds: readonly string[];
	}
): DirectorVerdict {
	const json = firstJsonObject(raw ?? '');
	if (!json) return EMPTY_VERDICT;

	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return EMPTY_VERDICT;
	}
	if (typeof parsed !== 'object' || parsed === null) return EMPTY_VERDICT;

	const record = parsed as Record<string, unknown>;
	const allowedFlags = new Set(allowed.flags);
	const allowedClues = new Set(allowed.clueIds);
	const allowedCharacters = new Set(allowed.characterIds);

	const flags = Array.isArray(record.flags)
		? [
				...new Set(
					record.flags.filter((f): f is string => typeof f === 'string' && allowedFlags.has(f))
				)
			]
		: [];

	const clues: DirectorVerdict['clues'] = [];
	for (const entry of asRecordArray(record.clues)) {
		const { id, character, value } = entry;
		if (typeof id !== 'string' || !allowedClues.has(id)) continue;
		if (typeof character !== 'string' || !allowedCharacters.has(character)) continue;
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		// An empty value would record a claim that says nothing but still counts as a source,
		// which is exactly how a clue would end up falsely "conflicting".
		if (!trimmed) continue;
		clues.push({ id, characterId: character, value: trimmed });
	}

	return { flags, clues };
}
