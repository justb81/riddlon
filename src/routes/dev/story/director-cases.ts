/**
 * Director cases: fixed transcripts with known answers, so the director pass can be measured the
 * same way twice (#54). A story keeps them next to its package as `director-cases.json` —
 * authoring-only, never packed (see `scripts/build-stories.mjs`) — and `/dev/story` runs each case
 * several times against whatever model is loaded, then tallies the verdicts against `expect`.
 *
 * Everything here is pure; the model call lives in the route. The protocol around it is in
 * `stories/README.md` ("Measuring the director"), the reasoning in docs/arc42 §8.4.4.
 */

import {
	buildDirectorQuestions,
	lastExchangeOf,
	type DirectorAllowlist,
	type DirectorQuestions,
	type DirectorSceneNode,
	type DirectorTurn,
	type DirectorVerdict
} from '$lib/llm/director.js';

/** How the player is named in a case transcript, and so in the prompt. */
export const CASE_PLAYER = 'Du';

export interface DirectorCase {
	/** Readable, unique within the file — it names the case in the results table. */
	id: string;
	/** The scene-graph node id the transcript belongs to. */
	scene: string;
	/** Goals already reached before this transcript, so a later beat can be asked on its own. */
	reachedGoals?: string[];
	/** Display-name overrides by character UUID — a masked character is `Unbekannt` in the transcript. */
	names?: Record<string, string>;
	/** `Name: text` per line, oldest first. The player is `Du`. */
	transcript: string[];
	expect: {
		/** Every goal the scene still asks, each with whether this transcript reaches it. */
		goals?: Record<string, boolean>;
		/** Every event the scene asks (`flag:…`), each with whether the last exchange shows it. */
		events?: Record<string, boolean>;
		/** A group scene's ending: an outcome id, or `none`. */
		outcome?: string;
		/** Clue claims the transcript does contain, as clue id → claiming character UUID. */
		clues?: Record<string, string>;
	};
}

export interface DirectorCaseFile {
	/** How often each case runs by default — Chrome's built-in model is not deterministic. */
	runs: number;
	cases: DirectorCase[];
}

export function parseCaseTranscript(lines: readonly string[]): DirectorTurn[] {
	return lines.map((line) => {
		const at = line.indexOf(':');
		return at === -1
			? { who: CASE_PLAYER, text: line.trim() }
			: { who: line.slice(0, at).trim(), text: line.slice(at + 1).trim() };
	});
}

/**
 * What a live pass would ask at the start of this case: no flag set yet, every clue still open,
 * only `reachedGoals` already held. Independent of any save, which is what makes it repeatable.
 */
export function caseQuestions(node: DirectorSceneNode, testCase: DirectorCase): DirectorQuestions {
	return buildDirectorQuestions(node, {
		reachedGoals: new Set(testCase.reachedGoals ?? []),
		isFlagSet: () => false,
		isClueOpen: () => true
	});
}

/**
 * The window and the last exchange exactly as `story-session` cuts them for a live pass. The
 * player's `Du` becomes `playerName`: a live transcript names the player by their nickname.
 */
export function caseTurns(
	testCase: DirectorCase,
	window: number,
	playerName: string = CASE_PLAYER
): { turns: DirectorTurn[]; lastExchange: DirectorTurn[] } {
	const all = parseCaseTranscript(testCase.transcript).map((t) =>
		t.who === CASE_PLAYER ? { ...t, who: playerName } : t
	);
	return {
		turns: all.slice(-window),
		lastExchange: lastExchangeOf(all, (t) => t.who === playerName)
	};
}

/**
 * Problems that would make a case's score meaningless: an expectation for a question the scene does
 * not ask, or a question asked with no expectation. Run before measuring, not after.
 */
export function checkCase(
	testCase: DirectorCase,
	node: DirectorSceneNode | undefined,
	participants: readonly string[]
): string[] {
	if (!node) return [`${testCase.id}: unknown scene ${testCase.scene}`];
	const q = caseQuestions(node, testCase);
	const problems: string[] = [];
	const compare = (
		kind: string,
		asked: readonly string[],
		expected: Record<string, boolean> = {}
	) => {
		for (const id of asked)
			if (!(id in expected)) problems.push(`${testCase.id}: ${kind} ${id} asked, not expected`);
		for (const id of Object.keys(expected))
			if (!asked.includes(id)) problems.push(`${testCase.id}: ${kind} ${id} expected, not asked`);
	};
	compare('goal', q.goals, testCase.expect.goals);
	compare('event', q.events, testCase.expect.events);
	const outcomeIds = q.outcomes.map((o) => o.id);
	if (outcomeIds.length > 0 && testCase.expect.outcome === undefined)
		problems.push(`${testCase.id}: outcome asked, not expected`);
	if (testCase.expect.outcome !== undefined && testCase.expect.outcome !== 'none') {
		if (!outcomeIds.includes(testCase.expect.outcome))
			problems.push(`${testCase.id}: outcome ${testCase.expect.outcome} expected, not asked`);
	}
	for (const [clueId, characterId] of Object.entries(testCase.expect.clues ?? {})) {
		if (!q.clueIds.includes(clueId))
			problems.push(`${testCase.id}: clue ${clueId} expected, not asked`);
		if (!participants.includes(characterId))
			problems.push(`${testCase.id}: clue ${clueId} claimed by ${characterId}, not in this scene`);
	}
	return problems;
}

/** One run's answers, each sorted into its confusion cell. */
export interface CaseScore {
	goals: Cells;
	events: Cells;
	/** `null` when the scene asks no ending. */
	outcome: 'right' | 'missed' | 'false' | 'wrong' | null;
	/** Expected clue claims the verdict contains. */
	cluesFound: number;
	cluesExpected: number;
	/** Claims the verdict contains that `expect.clues` does not name. */
	cluesExtra: number;
}

/** hit: true and expected; miss: false but expected; falsePositive: true, not expected. */
export interface Cells {
	hit: number;
	miss: number;
	falsePositive: number;
	correctNo: number;
}

const emptyCells = (): Cells => ({ hit: 0, miss: 0, falsePositive: 0, correctNo: 0 });

function cells(expected: Record<string, boolean> = {}, answeredYes: readonly string[]): Cells {
	const out = emptyCells();
	for (const [id, want] of Object.entries(expected)) {
		const got = answeredYes.includes(id);
		if (want && got) out.hit++;
		else if (want) out.miss++;
		else if (got) out.falsePositive++;
		else out.correctNo++;
	}
	return out;
}

export function scoreCase(
	testCase: DirectorCase,
	questions: DirectorQuestions,
	verdict: DirectorVerdict
): CaseScore {
	const chosen = questions.outcomes.find((o) => verdict.flags.includes(o.flag))?.id ?? 'none';
	const want = testCase.expect.outcome;
	let outcome: CaseScore['outcome'] = null;
	if (questions.outcomes.length > 0 && want !== undefined) {
		if (chosen === want) outcome = 'right';
		else if (chosen === 'none') outcome = 'missed';
		else if (want === 'none') outcome = 'false';
		else outcome = 'wrong';
	}
	const expectedClues = Object.entries(testCase.expect.clues ?? {});
	const claimed = (id: string, by: string) =>
		verdict.clues.some((c) => c.id === id && c.characterId === by);
	return {
		goals: cells(testCase.expect.goals, verdict.goals),
		events: cells(testCase.expect.events, verdict.flags),
		outcome,
		cluesFound: expectedClues.filter(([id, by]) => claimed(id, by)).length,
		cluesExpected: expectedClues.length,
		cluesExtra: verdict.clues.filter((c) => testCase.expect.clues?.[c.id] !== c.characterId).length
	};
}

/** One model call against one case, as `/dev/story` records it — also the fixture format. */
export interface CaseRun {
	caseId: string;
	model: string;
	window: number;
	/** Whether the scene's `goalDetails`/`flagDetails` were in the prompt. Absent in older files. */
	criteria?: boolean;
	/**
	 * The installed package version the run was asked against. `vite dev` without `npm run dev`
	 * skips `stories:bundle`, so the app may still run an older package than the repo holds.
	 */
	packageVersion?: string;
	prompt: string;
	/** Everything the parser was given, so a recorded answer can be parsed again in Node. */
	allowlist: Required<DirectorAllowlist>;
	raw: string;
	verdict: DirectorVerdict;
	ms: number;
	/** Set when the call threw instead of answering. */
	error?: string;
	/** The answer held no JSON object: scored as nothing, not as "no" to everything. */
	unreadable?: boolean;
}

export interface Tally {
	runs: number;
	errors: number;
	unreadable: number;
	goals: Cells;
	events: Cells;
	outcomes: { right: number; missed: number; false: number; wrong: number };
	cluesFound: number;
	cluesExpected: number;
	cluesExtra: number;
	medianMs: number | null;
}

export function tally(scored: readonly { run: CaseRun; score: CaseScore | null }[]): Tally {
	const t: Tally = {
		runs: scored.length,
		errors: 0,
		unreadable: 0,
		goals: emptyCells(),
		events: emptyCells(),
		outcomes: { right: 0, missed: 0, false: 0, wrong: 0 },
		cluesFound: 0,
		cluesExpected: 0,
		cluesExtra: 0,
		medianMs: null
	};
	const add = (into: Cells, from: Cells) => {
		into.hit += from.hit;
		into.miss += from.miss;
		into.falsePositive += from.falsePositive;
		into.correctNo += from.correctNo;
	};
	const times: number[] = [];
	for (const { run, score } of scored) {
		if (run.error) {
			t.errors++;
			continue;
		}
		times.push(run.ms);
		if (run.unreadable || !score) {
			t.unreadable++;
			continue;
		}
		add(t.goals, score.goals);
		add(t.events, score.events);
		if (score.outcome) t.outcomes[score.outcome]++;
		t.cluesFound += score.cluesFound;
		t.cluesExpected += score.cluesExpected;
		t.cluesExtra += score.cluesExtra;
	}
	if (times.length > 0) {
		times.sort((a, b) => a - b);
		const mid = times.length >> 1;
		t.medianMs = times.length % 2 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2);
	}
	return t;
}

/** `a of b` — the form the numbers are recorded in (docs/arc42 §11.2), never a bare percentage. */
export function ratio(a: number, b: number): string {
	return b === 0 ? '—' : `${a} of ${b}`;
}
