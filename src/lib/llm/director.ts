/**
 * The "director" pass: after a character has answered, a second, short model call answers a set of
 * small questions about the conversation — which clue claims were made, which of the scene's goals
 * are now reached, whether a mid-scene event happened, and which (if any) ending a group scene has
 * reached. Its verdict is applied through the engine, which is what advances the graph.
 *
 * Why this exists: a story package contains no dialogue and no keyword triggers — a scene only
 * declares `goals`, `exitConditions` (`flag:…`) and `revealables` (`clue:…`/`fact:…`). Something
 * has to translate free conversation into those symbols. This is that interface (docs/arc42 §8.4.4).
 *
 * Why many small questions instead of one judgement (#54): measured against Chrome's built-in
 * model, one "are all goals met?" verdict per scene set the exit flag in only about half the runs
 * where the goal was reached — and almost never once the same answer also had to list clues. The
 * director therefore never decides a scene's exit flag itself: it answers yes/no per goal, the
 * caller remembers reached goals across turns, and `exitFlagsReached` sets the flag once every goal
 * holds. A group scene's endings are one single-choice question, so two mutually exclusive
 * outcomes can no longer be set by the same answer.
 *
 * Both halves here are pure so they can be tested in Node without a GPU; the model call itself
 * lives in `state/story-session.svelte.ts`.
 *
 * The parser is deliberately paranoid. A local model will produce prose around its JSON, invent
 * ids, copy a clue's label instead of quoting the conversation, or return nothing — none of which
 * may move the story. Every id is checked against the questions *this scene* asked, and every clue
 * value must be traceable to something the claimed character actually said, so the worst case of a
 * bad answer is "nothing happens", never "something else happened".
 */

/** The parts of a scene-graph node the director reads — structurally a subset of both node types. */
export interface DirectorSceneNode {
	goals: readonly string[];
	exitConditions: readonly string[];
	revealables: readonly string[];
	/** `flag:` refs the scene lets the director set without completing it (#97). */
	settableFlags?: readonly string[];
	/** A group scene's endings (docs/arc42 §8.1.7). */
	outcomes?: readonly {
		id: string;
		condition: string;
		label?: string;
		closingText?: string;
	}[];
}

export interface DirectorOutcome {
	id: string;
	/** The `flag:` ref the outcome is conditioned on — what choosing it sets. */
	flag: string;
	label?: string;
	description?: string;
}

/** Everything one director call is asked — only what is still open in the active scene. */
export interface DirectorQuestions {
	/** Goal slugs not yet reached. */
	goals: readonly string[];
	/** Mid-scene `flag:` refs, each asked as its own yes/no question. */
	events: readonly string[];
	/** A group scene's still-reachable endings, asked as one single choice. */
	outcomes: readonly DirectorOutcome[];
	/** Clue refs a cast member may still claim. */
	clueIds: readonly string[];
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
	/** Goal slugs the answer reports as reached in this exchange. */
	goals: string[];
	/** Event flags and at most one outcome flag. Never a scene's exit flag — see `exitFlagsReached`. */
	flags: string[];
	clues: { id: string; characterId: string; value: string }[];
}

/** The context `parseDirectorVerdict` checks an answer against. */
export interface DirectorAllowlist {
	questions: DirectorQuestions;
	characters: readonly DirectorCharacter[];
	/** Labels of the asked clues — a value that only repeats its label is not a claim. */
	clues?: readonly DirectorClue[];
	/** The transcript the director saw — a clue value must be traceable to it. */
	turns?: readonly DirectorTurn[];
}

const EMPTY_VERDICT: DirectorVerdict = { goals: [], flags: [], clues: [] };
const NO_OUTCOME = 'none';

/** Only plain `flag:` refs are settable — never `not:flag:…`, `scene-completed:…` and the like. */
function isSettableFlag(ref: string): boolean {
	return ref.startsWith('flag:');
}

function bareId(ref: string): string {
	return ref.startsWith('flag:') ? ref.slice('flag:'.length) : ref;
}

/**
 * The questions still worth asking in a scene. Goals are asked only while one of the scene's exit
 * flags is still open — once it is set, answering them again changes nothing. A scene that declares
 * exit flags but no goals has nothing to aggregate, so its exit flags are asked directly, like
 * events. An outcome conditioned on anything but a plain flag cannot be chosen by the director, or
 * it could "reach" an ending by asserting the very thing that rules it out.
 */
export function buildDirectorQuestions(
	scene: DirectorSceneNode,
	state: {
		reachedGoals: ReadonlySet<string>;
		isFlagSet: (ref: string) => boolean;
		isClueOpen: (clueId: string) => boolean;
	}
): DirectorQuestions {
	const exitFlags = scene.exitConditions.filter(isSettableFlag);
	const openExitFlags = exitFlags.filter((ref) => !state.isFlagSet(ref));

	const outcomes: DirectorOutcome[] = [];
	for (const outcome of scene.outcomes ?? []) {
		if (!isSettableFlag(outcome.condition) || state.isFlagSet(outcome.condition)) continue;
		if (outcomes.some((o) => o.flag === outcome.condition)) continue;
		outcomes.push({
			id: outcome.id,
			flag: outcome.condition,
			label: outcome.label,
			description: outcome.closingText
		});
	}
	const outcomeFlags = new Set(outcomes.map((o) => o.flag));

	const events = new Set<string>();
	for (const ref of scene.settableFlags ?? []) {
		if (!isSettableFlag(ref) || state.isFlagSet(ref)) continue;
		if (exitFlags.includes(ref) || outcomeFlags.has(ref)) continue;
		events.add(ref);
	}
	if (scene.goals.length === 0) for (const ref of openExitFlags) events.add(ref);

	return {
		goals:
			openExitFlags.length > 0 ? scene.goals.filter((goal) => !state.reachedGoals.has(goal)) : [],
		events: [...events],
		outcomes,
		clueIds: scene.revealables.filter((ref) => ref.startsWith('clue:') && state.isClueOpen(ref))
	};
}

/** A scene's open exit flags once every one of its goals has been reached — else nothing. */
export function exitFlagsReached(
	scene: Pick<DirectorSceneNode, 'goals' | 'exitConditions'>,
	reachedGoals: ReadonlySet<string>,
	isFlagSet: (ref: string) => boolean
): string[] {
	if (scene.goals.length === 0) return [];
	if (!scene.goals.every((goal) => reachedGoals.has(goal))) return [];
	return scene.exitConditions.filter((ref) => isSettableFlag(ref) && !isFlagSet(ref));
}

/** Whether a question set asks anything at all — an empty one needs no model call. */
export function hasDirectorQuestions(questions: DirectorQuestions): boolean {
	return (
		questions.goals.length > 0 ||
		questions.events.length > 0 ||
		questions.outcomes.length > 0 ||
		questions.clueIds.length > 0
	);
}

/**
 * The director's instruction. Lists only what this scene still asks, so the model is never even
 * shown an id it isn't allowed to pick — the allowlist in `parseDirectorVerdict` then enforces the
 * same thing a second time, on the answer. Clues come first in the answer, so the model has
 * written down the evidence before it answers the questions that depend on it.
 */
export function buildDirectorPrompt(input: {
	questions: DirectorQuestions;
	clues: readonly DirectorClue[];
	characters: readonly DirectorCharacter[];
	turns: readonly DirectorTurn[];
	/**
	 * The player's last line and what followed it. Events are judged on this alone: asked over the
	 * whole window, Nano answered "false-accusation" yes to an innocent "did you see anyone?" (#54).
	 */
	lastExchange?: readonly DirectorTurn[];
}): string {
	const { questions } = input;
	const transcript = input.turns.map((turn) => `${turn.who}: ${turn.text}`).join('\n');
	const sections: string[] = [];
	const format: string[] = [];

	if (questions.clueIds.length > 0) {
		const clueLines = questions.clueIds.map((id) => {
			const label = input.clues.find((clue) => clue.id === id)?.label;
			return label ? `- ${id} — ${label}` : `- ${id}`;
		});
		const characterLines = input.characters.map((c) => `- ${c.id} — ${c.name}`);
		sections.push(
			[
				'Hinweise: Trage einen Hinweis nur ein, wenn eine Figur ihn im Gespräch selbst konkret',
				'genannt hat. "value" gibt wieder, was die Figur gesagt hat, nicht die Bezeichnung des Hinweises.',
				...clueLines,
				'Figuren:',
				...(characterLines.length > 0 ? characterLines : ['(keine)'])
			].join('\n')
		);
		format.push(
			'"clues": [{"id": "<clue-ref>", "character": "<uuid>", "value": "<was gesagt wurde>"}]'
		);
	}

	if (questions.goals.length > 0) {
		sections.push(
			[
				'Ziele: Beantworte jedes Ziel einzeln mit true, wenn es im Gespräch erreicht wurde,',
				'sonst mit false.',
				...questions.goals.map((goal) => `- ${goal}`)
			].join('\n')
		);
		format.push(`"goals": {${questions.goals.map((g) => `"${g}": <true|false>`).join(', ')}}`);
	}

	if (questions.events.length > 0) {
		const ids = questions.events.map(bareId);
		const exchange = (input.lastExchange ?? input.turns).map((t) => `${t.who}: ${t.text}`);
		sections.push(
			[
				'Letzter Wortwechsel:',
				...(exchange.length > 0 ? exchange : ['(leer)']),
				'',
				'Ereignisse: Beantworte jedes Ereignis einzeln mit true, wenn es im letzten Wortwechsel',
				'(nur dieser Ausschnitt zählt, nicht das Gespräch davor) tatsächlich eingetreten ist,',
				'sonst mit false.',
				...ids.map((id) => `- ${id}`)
			].join('\n')
		);
		format.push(`"events": {${ids.map((id) => `"${id}": <true|false>`).join(', ')}}`);
	}

	if (questions.outcomes.length > 0) {
		const lines = questions.outcomes.map((outcome) => {
			const text = [outcome.label, outcome.description].filter(Boolean).join(': ');
			return text ? `- ${outcome.id} — ${text}` : `- ${outcome.id}`;
		});
		sections.push(
			[
				'Ausgang: Wähle genau einen Ausgang, der im Gespräch eingetreten ist, oder "none",',
				'solange keiner eingetreten ist.',
				...lines
			].join('\n')
		);
		const ids = [NO_OUTCOME, ...questions.outcomes.map((o) => o.id)];
		format.push(`"outcome": "<${ids.join('|')}>"`);
	}

	return [
		'Du bist ein stiller Spielleiter. Du liest einen Gesprächsausschnitt und beantwortest Fragen',
		'dazu. Antworte ausschließlich mit einem JSON-Objekt, ohne Erklärung, ohne Markdown.',
		'',
		'Gespräch:',
		transcript || '(leer)',
		'',
		...sections.flatMap((section) => [section, '']),
		'Format:',
		`{${format.join(', ')}}`
	].join('\n');
}

/**
 * The JSON Schema the verdict is decoded against (docs/arc42 §8.4.4): the same allowlist
 * `parseDirectorVerdict` enforces, as `enum`s and fixed boolean keys, so a constrained decoder
 * cannot even emit prose, an invented id or a second ending. A provider may ignore it — the parser
 * stays the safety net.
 */
export function buildDirectorSchema(allowed: {
	questions: DirectorQuestions;
	characters: readonly DirectorCharacter[];
}): Record<string, unknown> {
	const { questions } = allowed;
	const properties: Record<string, unknown> = {};
	const characterIds = allowed.characters.map((c) => c.id);

	if (questions.clueIds.length > 0 && characterIds.length > 0) {
		properties.clues = {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'string', enum: [...questions.clueIds] },
					character: { type: 'string', enum: characterIds },
					value: { type: 'string' }
				},
				required: ['id', 'character', 'value'],
				additionalProperties: false
			}
		};
	}
	const booleans = (keys: readonly string[]) => ({
		type: 'object',
		properties: Object.fromEntries(keys.map((key) => [key, { type: 'boolean' }])),
		required: [...keys],
		additionalProperties: false
	});
	if (questions.goals.length > 0) properties.goals = booleans(questions.goals);
	if (questions.events.length > 0) properties.events = booleans(questions.events.map(bareId));
	if (questions.outcomes.length > 0) {
		properties.outcome = {
			type: 'string',
			enum: [NO_OUTCOME, ...questions.outcomes.map((o) => o.id)]
		};
	}

	return {
		type: 'object',
		properties,
		required: Object.keys(properties),
		additionalProperties: false
	};
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

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/** A yes in whatever shape a small model writes it — `true`, `"true"`, `"ja"`. Everything else is no. */
function isYes(value: unknown): boolean {
	if (value === true) return true;
	if (typeof value !== 'string') return false;
	return ['true', 'ja', 'yes'].includes(value.trim().toLowerCase());
}

/** `ref` matched against `allowed` with or without its `flag:` prefix — never anything else. */
function matchFlag(ref: string, allowed: readonly string[]): string | null {
	if (allowed.includes(ref)) return ref;
	const prefixed = `flag:${ref}`;
	return allowed.includes(prefixed) ? prefixed : null;
}

/** `character` resolved to a scene uuid: exact id match first, then a case-insensitive name match. */
function resolveCharacterId(
	character: string,
	characters: readonly DirectorCharacter[]
): string | null {
	const byId = characters.find((c) => c.id === character);
	if (byId) return byId.id;
	const needle = character.trim().toLowerCase();
	const byName = characters.find((c) => c.name.trim().toLowerCase() === needle);
	return byName?.id ?? null;
}

/** Words that carry no evidence on their own — a match on "der" proves nothing. */
// prettier-ignore
const FILLER_WORDS = new Set([
	'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'und',
	'oder', 'ist', 'war', 'hat', 'hatte', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mit',
	'von', 'zu', 'zur', 'zum', 'im', 'in', 'an', 'am', 'auf', 'aus', 'bei', 'für', 'so', 'auch',
	'noch', 'nur', 'da', 'dort', 'hier', 'wie', 'was', 'wer', 'the', 'and'
]);

function normalizeText(text: string): string {
	return text
		.toLowerCase()
		.replace(/[’'`´]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/** Content words reduced to a short stem, so "Garderobe" still finds "Garderoben". */
function evidenceStems(text: string): Set<string> {
	const stems = new Set<string>();
	for (const word of normalizeText(text).split(' ')) {
		if (!word || FILLER_WORDS.has(word)) continue;
		if (word.length < 3 && !/\d/.test(word)) continue;
		stems.add(word.slice(0, 5));
	}
	return stems;
}

/**
 * Whether a claimed value can be traced to what that character said in the transcript: at least
 * one of its content words must appear in one of their own lines, and it must not merely repeat the
 * clue's label. Without a transcript (an older caller) the check cannot run and passes.
 */
function isClaimSupported(
	value: string,
	characterName: string,
	label: string | undefined,
	turns: readonly DirectorTurn[] | undefined
): boolean {
	if (label && normalizeText(value) === normalizeText(label)) return false;
	if (!turns) return true;
	const speaker = characterName.trim().toLowerCase();
	const spoken = new Set<string>();
	for (const turn of turns) {
		if (turn.who.trim().toLowerCase() !== speaker) continue;
		for (const stem of evidenceStems(turn.text)) spoken.add(stem);
	}
	for (const stem of evidenceStems(value)) if (spoken.has(stem)) return true;
	return false;
}

/**
 * Parses the model's answer and drops everything the scene didn't ask. Returns an empty verdict
 * for anything unparseable — a director that can't be understood must not be able to move the
 * story.
 */
export function parseDirectorVerdict(raw: string, allowed: DirectorAllowlist): DirectorVerdict {
	const json = firstJsonObject(raw ?? '');
	if (!json) return EMPTY_VERDICT;

	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return EMPTY_VERDICT;
	}
	const record = asRecord(parsed);
	const { questions } = allowed;
	const allowedClues = new Set(questions.clueIds);
	const eventIds = questions.events;

	const goals = new Set<string>();
	const goalAnswers = asRecord(record.goals);
	for (const goal of questions.goals) if (isYes(goalAnswers[goal])) goals.add(goal);

	const flags = new Set<string>();
	const eventAnswers = asRecord(record.events);
	for (const [key, answer] of Object.entries(eventAnswers)) {
		if (!isYes(answer)) continue;
		const flag = matchFlag(key, eventIds);
		if (flag) flags.add(flag);
	}

	// Exactly one ending, or none: a second id — in any shape — voids the choice rather than
	// picking one of them, because two endings at once is never what happened.
	const chosen = new Set<string>();
	const outcomeValues = Array.isArray(record.outcome) ? record.outcome : [record.outcome];
	for (const value of outcomeValues) {
		if (typeof value !== 'string') continue;
		const outcome = questions.outcomes.find(
			(o) => o.id === value.trim() || o.flag === value.trim() || bareId(o.flag) === value.trim()
		);
		if (outcome) chosen.add(outcome.flag);
	}
	// The pre-#54 answer shape — a `flags` array — still reaches events, and an ending only alone.
	if (Array.isArray(record.flags)) {
		for (const ref of record.flags) {
			if (typeof ref !== 'string') continue;
			const event = matchFlag(ref, eventIds);
			if (event) flags.add(event);
			const outcome = matchFlag(
				ref,
				questions.outcomes.map((o) => o.flag)
			);
			if (outcome) chosen.add(outcome);
		}
	}
	if (chosen.size === 1) flags.add([...chosen][0]);

	const clues: DirectorVerdict['clues'] = [];
	for (const entry of asRecordArray(record.clues)) {
		const { id, character, value } = entry;
		if (typeof id !== 'string' || typeof character !== 'string' || typeof value !== 'string') {
			continue;
		}

		// The model sometimes reports an event here instead of in `events` — salvage it as a flag
		// rather than silently dropping the whole entry (reproduced live with the old answer shape).
		if (!allowedClues.has(id)) {
			const event = matchFlag(id, eventIds);
			if (event) flags.add(event);
			continue;
		}

		const characterId = resolveCharacterId(character, allowed.characters);
		if (!characterId) continue;
		const trimmed = value.trim();
		// An empty value would record a claim that says nothing but still counts as a source.
		if (!trimmed) continue;
		// One claim per clue and character per verdict: constrained decoding makes the model list
		// the same clue several times, and a second value from one source reads as a contradiction.
		if (clues.some((c) => c.id === id && c.characterId === characterId)) continue;
		const name = allowed.characters.find((c) => c.id === characterId)?.name ?? '';
		const label = allowed.clues?.find((clue) => clue.id === id)?.label;
		if (!isClaimSupported(trimmed, name, label, allowed.turns)) continue;
		clues.push({ id, characterId, value: trimmed });
	}

	return { goals: [...goals], flags: [...flags], clues };
}
