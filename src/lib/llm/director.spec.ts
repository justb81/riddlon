import { describe, expect, it } from 'vitest';
import {
	buildDirectorPrompt,
	buildDirectorQuestions,
	buildDirectorSchema,
	exitFlagsReached,
	hasDirectorQuestions,
	isReadableDirectorAnswer,
	lastExchangeOf,
	parseDirectorVerdict,
	type DirectorAllowlist,
	type DirectorQuestions,
	type DirectorSceneNode
} from './director.js';

const LUCY = '3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f';
const MAX = '8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e';
const SABINE = 'c1a4e7f2-9d3b-4f6a-8e1c-5b7d9f0a2c4e';

const characters = [
	{ id: LUCY, name: 'Lucy' },
	{ id: MAX, name: 'Max' }
];

const nothingYet = {
	reachedGoals: new Set<string>(),
	isFlagSet: () => false,
	isClueOpen: () => true
};

const witnessScene: DirectorSceneNode = {
	goals: ['seed-timeline', 'seed-location'],
	exitConditions: ['flag:max-questioned', 'scene-completed:some-other-scene'],
	revealables: ['clue:time-window', 'fact:club-name'],
	settableFlags: ['flag:max-questioned', 'flag:lied', 'not:flag:lied']
};

const groupScene: DirectorSceneNode = {
	goals: ['resolve-case'],
	exitConditions: [],
	revealables: [],
	outcomes: [
		{
			id: 'max-confesses',
			condition: 'flag:evidence-presented',
			label: 'Fall gelöst',
			closingText: 'Max gibt es zu.'
		},
		{
			id: 'false-accusation-made',
			condition: 'flag:false-accusation',
			label: 'Falsch beschuldigt'
		},
		// "…and the player never wrongly accused anyone" must not be choosable by the model.
		{ id: 'clean-run', condition: 'not:flag:false-accusation' }
	]
};

const witnessQuestions = buildDirectorQuestions(witnessScene, nothingYet);

const turns = [
	{ who: 'Alex', text: 'Wann ist das passiert?' },
	{ who: 'Max', text: 'So gegen 22 Uhr, die Jacke hing an der Garderobe.' }
];

const witnessAllowed: DirectorAllowlist = {
	questions: witnessQuestions,
	characters,
	clues: [{ id: 'clue:time-window', label: 'Ungefähre Tatzeit' }],
	turns
};

describe('buildDirectorQuestions', () => {
	it('asks open goals, mid-scene events and clue refs — never facts or negated flags', () => {
		expect(witnessQuestions).toEqual({
			goals: ['seed-timeline', 'seed-location'],
			events: ['flag:lied'],
			outcomes: [],
			clueIds: ['clue:time-window']
		});
	});

	it('does not ask a goal that is already remembered as reached', () => {
		const questions = buildDirectorQuestions(witnessScene, {
			...nothingYet,
			reachedGoals: new Set(['seed-timeline'])
		});
		expect(questions.goals).toEqual(['seed-location']);
	});

	it('stops asking goals once the exit flag is set, since answering changes nothing', () => {
		const questions = buildDirectorQuestions(witnessScene, {
			...nothingYet,
			isFlagSet: (ref) => ref === 'flag:max-questioned'
		});
		expect(questions.goals).toEqual([]);
	});

	it('asks exit flags directly when a scene declares no goals to aggregate', () => {
		const questions = buildDirectorQuestions(
			{ goals: [], exitConditions: ['flag:done'], revealables: [] },
			nothingYet
		);
		expect(questions.events).toEqual(['flag:done']);
	});

	it('offers a group scene’s flag-conditioned endings as one choice and skips negated ones', () => {
		const questions = buildDirectorQuestions(groupScene, nothingYet);
		expect(questions.outcomes.map((o) => o.id)).toEqual(['max-confesses', 'false-accusation-made']);
		expect(questions.goals).toEqual([]);
		expect(questions.events).toEqual([]);
	});

	it('does not ask an ending as an event too, even when the scene lists its flag as settable', () => {
		const questions = buildDirectorQuestions(
			{ ...groupScene, settableFlags: ['flag:false-accusation'] },
			nothingYet
		);
		expect(questions.events).toEqual([]);
	});

	it('skips clues no cast member can still claim', () => {
		const questions = buildDirectorQuestions(witnessScene, {
			...nothingYet,
			isClueOpen: () => false
		});
		expect(questions.clueIds).toEqual([]);
	});

	it('reports when there is nothing to ask', () => {
		expect(hasDirectorQuestions({ goals: [], events: [], outcomes: [], clueIds: [] })).toBe(false);
		expect(hasDirectorQuestions(witnessQuestions)).toBe(true);
	});
});

describe('exitFlagsReached', () => {
	it('sets the exit flag only once every goal has been reached, across turns', () => {
		const isFlagSet = () => false;
		expect(exitFlagsReached(witnessScene, new Set(['seed-timeline']), isFlagSet)).toEqual([]);
		expect(
			exitFlagsReached(witnessScene, new Set(['seed-timeline', 'seed-location']), isFlagSet)
		).toEqual(['flag:max-questioned']);
	});

	it('never derives anything for a scene without goals, or an exit flag already set', () => {
		expect(exitFlagsReached(groupScene, new Set(), () => false)).toEqual([]);
		expect(
			exitFlagsReached(witnessScene, new Set(['seed-timeline', 'seed-location']), () => true)
		).toEqual([]);
	});
});

describe('isReadableDirectorAnswer', () => {
	it('tells an answer with a JSON object from one without', () => {
		expect(isReadableDirectorAnswer('Klar! {"goals": {"a": false}} Fertig.')).toBe(true);
		expect(isReadableDirectorAnswer('{}')).toBe(true);
		expect(isReadableDirectorAnswer('Alle Ziele sind erreicht.')).toBe(false);
		expect(isReadableDirectorAnswer('{goals: nein}')).toBe(false);
		expect(isReadableDirectorAnswer('')).toBe(false);
	});
});

describe('lastExchangeOf', () => {
	const isPlayer = (t: { who: string }) => t.who === 'Du';

	it('starts at the last player line and keeps every reply after it', () => {
		const turns = [
			{ who: 'Du', text: 'a' },
			{ who: 'Max', text: 'b' },
			{ who: 'Du', text: 'c' },
			{ who: 'Max', text: 'd' },
			{ who: 'Max', text: 'e' }
		];
		expect(lastExchangeOf(turns, isPlayer).map((t) => t.text)).toEqual(['c', 'd', 'e']);
	});

	it('treats a window with no player line as one exchange', () => {
		const turns = [{ who: 'Max', text: 'a' }];
		expect(lastExchangeOf(turns, isPlayer)).toEqual(turns);
	});
});

describe('buildDirectorPrompt', () => {
	it('shows only what this scene asks, with clue labels and the transcript', () => {
		const prompt = buildDirectorPrompt({
			questions: witnessQuestions,
			clues: [
				{ id: 'clue:time-window', label: 'Ungefähre Tatzeit' },
				{ id: 'clue:location', label: 'Ort' }
			],
			characters,
			turns
		});
		expect(prompt).toContain('clue:time-window — Ungefähre Tatzeit');
		expect(prompt).not.toContain('clue:location');
		expect(prompt).toContain('- seed-timeline');
		expect(prompt).toContain('- lied');
		expect(prompt).toContain('Max: So gegen 22 Uhr');
		// The exit flag is derived from the goals — the model is never asked for it.
		expect(prompt).not.toContain('max-questioned');
		expect(prompt).not.toContain('scene-completed:');
	});

	it("shows a goal's reachedWhen next to its slug, never its intent", () => {
		const prompt = buildDirectorPrompt({
			questions: witnessQuestions,
			clues: [],
			characters,
			turns,
			goalDetails: {
				'seed-timeline': {
					reachedWhen: 'Max hat eine ungefähre Uhrzeit genannt.',
					// @ts-expect-error -- intent exists on the package field, the director must ignore it
					intent: 'Sag, wann es war.'
				}
			}
		});
		expect(prompt).toContain('- seed-timeline — Max hat eine ungefähre Uhrzeit genannt.');
		expect(prompt).not.toContain('Sag, wann es war.');
		// The answer keys stay the slugs.
		expect(prompt).toContain('"seed-timeline": <true|false>');
	});

	it("shows an event's and an ending's reachedWhen, the latter in place of its closing text", () => {
		const flagDetails = {
			'flag:lied': { reachedWhen: 'Max hat nachweislich gelogen.' },
			'flag:evidence-presented': { reachedWhen: 'Max hat gestanden.' }
		};
		const witness = buildDirectorPrompt({
			questions: witnessQuestions,
			clues: [],
			characters,
			turns,
			flagDetails
		});
		expect(witness).toContain('- lied — Max hat nachweislich gelogen.');
		expect(witness).toContain('"lied": <true|false>');

		const group = buildDirectorPrompt({
			questions: buildDirectorQuestions(groupScene, nothingYet),
			clues: [],
			characters,
			turns,
			flagDetails
		});
		expect(group).toContain('- max-confesses — Fall gelöst: Max hat gestanden.');
		expect(group).not.toContain('Max gibt es zu.');
		expect(group).toContain('- false-accusation-made — Falsch beschuldigt');
	});

	it('judges events on the last exchange only', () => {
		const prompt = buildDirectorPrompt({
			questions: witnessQuestions,
			clues: [],
			characters,
			turns: [
				{ who: 'Ich', text: 'Du warst es doch!' },
				{ who: 'Max', text: 'Nein.' },
				{ who: 'Ich', text: 'Hast du jemanden gesehen?' }
			],
			lastExchange: [{ who: 'Ich', text: 'Hast du jemanden gesehen?' }]
		});
		const events = prompt.slice(prompt.indexOf('Letzter Wortwechsel:'));
		expect(events).toContain('Letzter Wortwechsel:\nIch: Hast du jemanden gesehen?');
		expect(events).not.toContain('Du warst es doch');
	});

	it('asks for clues before goals, so the evidence is written down first', () => {
		const prompt = buildDirectorPrompt({
			questions: witnessQuestions,
			clues: [],
			characters,
			turns
		});
		const format = prompt.slice(prompt.indexOf('Format:'));
		expect(format.indexOf('"clues"')).toBeLessThan(format.indexOf('"goals"'));
	});

	it('describes each ending with its label and closing text and offers "none"', () => {
		const prompt = buildDirectorPrompt({
			questions: buildDirectorQuestions(groupScene, nothingYet),
			clues: [],
			characters,
			turns: []
		});
		expect(prompt).toContain('- max-confesses — Fall gelöst: Max gibt es zu.');
		expect(prompt).toContain('"outcome": "<none|max-confesses|false-accusation-made>"');
		expect(prompt).toContain('(leer)');
	});

	it('leaves out every section the scene does not ask', () => {
		const prompt = buildDirectorPrompt({
			questions: { goals: [], events: [], outcomes: [], clueIds: ['clue:time-window'] },
			clues: [],
			characters,
			turns
		});
		expect(prompt).not.toContain('Ziele:');
		expect(prompt).not.toContain('Ereignisse:');
		expect(prompt).not.toContain('Ausgang:');
	});
});

describe('buildDirectorSchema', () => {
	it('fixes every key and enumerates exactly the allowlist', () => {
		expect(buildDirectorSchema({ questions: witnessQuestions, characters })).toEqual({
			type: 'object',
			properties: {
				clues: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: { type: 'string', enum: ['clue:time-window'] },
							character: { type: 'string', enum: [LUCY, MAX] },
							value: { type: 'string' }
						},
						required: ['id', 'character', 'value'],
						additionalProperties: false
					}
				},
				goals: {
					type: 'object',
					properties: {
						'seed-timeline': { type: 'boolean' },
						'seed-location': { type: 'boolean' }
					},
					required: ['seed-timeline', 'seed-location'],
					additionalProperties: false
				},
				events: {
					type: 'object',
					properties: { lied: { type: 'boolean' } },
					required: ['lied'],
					additionalProperties: false
				}
			},
			required: ['clues', 'goals', 'events'],
			additionalProperties: false
		});
	});

	it('makes the ending a single enum value, so two endings cannot even be decoded', () => {
		const schema = buildDirectorSchema({
			questions: buildDirectorQuestions(groupScene, nothingYet),
			characters
		});
		const { outcome } = schema.properties as Record<string, Record<string, unknown>>;
		expect(outcome).toEqual({
			type: 'string',
			enum: ['none', 'max-confesses', 'false-accusation-made']
		});
	});
});

describe('parseDirectorVerdict', () => {
	it('reads a clean answer', () => {
		const raw = JSON.stringify({
			clues: [{ id: 'clue:time-window', character: MAX, value: 'gegen 22 Uhr' }],
			goals: { 'seed-timeline': true, 'seed-location': false },
			events: { lied: false }
		});
		expect(parseDirectorVerdict(raw, witnessAllowed)).toEqual({
			goals: ['seed-timeline'],
			flags: [],
			clues: [{ id: 'clue:time-window', characterId: MAX, value: 'gegen 22 Uhr' }]
		});
	});

	it('digs the object out of surrounding prose and code fences', () => {
		const raw = 'Sicher! ```json\n{"goals": {"seed-timeline": true}}\n``` Fertig.';
		expect(parseDirectorVerdict(raw, witnessAllowed).goals).toEqual(['seed-timeline']);
	});

	it('is not confused by braces inside strings', () => {
		const raw = `{"clues": [{"id":"clue:time-window","character":"${MAX}","value":"gegen {22} Uhr"}]}`;
		expect(parseDirectorVerdict(raw, witnessAllowed).clues[0].value).toBe('gegen {22} Uhr');
	});

	it('accepts the yes a small model writes as a string, and nothing vaguer', () => {
		const raw =
			'{"goals": {"seed-timeline": "ja", "seed-location": "vielleicht"}, "events": {"lied": "true"}}';
		const verdict = parseDirectorVerdict(raw, witnessAllowed);
		expect(verdict.goals).toEqual(['seed-timeline']);
		expect(verdict.flags).toEqual(['flag:lied']);
	});

	it('drops goals, events and clues the scene never asked', () => {
		const raw = JSON.stringify({
			goals: { 'seed-timeline': true, 'invented-goal': true },
			events: { lied: true, 'evidence-presented': true },
			clues: [{ id: 'clue:location', character: MAX, value: 'Garderobe' }]
		});
		expect(parseDirectorVerdict(raw, witnessAllowed)).toEqual({
			goals: ['seed-timeline'],
			flags: ['flag:lied'],
			clues: []
		});
	});

	it.each([
		['no json at all', 'Ich bin mir nicht sicher.'],
		['broken json', '{"goals": {"seed-timeline": true,}'],
		['an empty answer', ''],
		['wrong field types', '{"goals": "seed-timeline", "clues": "none", "events": []}']
	])('returns an empty verdict for %s', (_label, raw) => {
		expect(parseDirectorVerdict(raw, witnessAllowed)).toEqual({ goals: [], flags: [], clues: [] });
	});

	describe('endings', () => {
		const groupAllowed: DirectorAllowlist = {
			questions: buildDirectorQuestions(groupScene, nothingYet),
			characters
		};

		it('sets the chosen ending’s flag', () => {
			const verdict = parseDirectorVerdict('{"outcome": "max-confesses"}', groupAllowed);
			expect(verdict.flags).toEqual(['flag:evidence-presented']);
		});

		it('sets nothing for "none"', () => {
			expect(parseDirectorVerdict('{"outcome": "none"}', groupAllowed).flags).toEqual([]);
		});

		// Measured live (#54): asked the old way, Chrome's built-in model set both endings for a
		// confession in 3 of 4 runs — "Fall gelöst" and "Falsche Beschuldigung" at once.
		it('voids a choice that names two endings, in either answer shape', () => {
			expect(
				parseDirectorVerdict(
					'{"outcome": ["max-confesses", "false-accusation-made"]}',
					groupAllowed
				).flags
			).toEqual([]);
			expect(
				parseDirectorVerdict(
					'{"flags": ["flag:evidence-presented", "flag:false-accusation"], "clues": []}',
					groupAllowed
				).flags
			).toEqual([]);
		});

		it('still reads a single ending reported the pre-#54 way, as a bare flag id', () => {
			const verdict = parseDirectorVerdict('{"flags": ["evidence-presented"]}', groupAllowed);
			expect(verdict.flags).toEqual(['flag:evidence-presented']);
		});
	});

	describe('clue values must be traceable to the conversation', () => {
		it('drops a value that only repeats the clue’s label', () => {
			// Measured live (#54): constrained, the model filled `value` with the label in 6 of 33 claims.
			const raw = `{"clues": [{"id":"clue:time-window","character":"${MAX}","value":"Ungefähre Tatzeit"}]}`;
			expect(parseDirectorVerdict(raw, witnessAllowed).clues).toEqual([]);
		});

		it('drops a claim the character never made, even if someone else said it', () => {
			const raw = `{"clues": [{"id":"clue:time-window","character":"${LUCY}","value":"gegen 22 Uhr"}]}`;
			expect(parseDirectorVerdict(raw, witnessAllowed).clues).toEqual([]);
		});

		it('keeps a paraphrase that shares a content word with the character’s own line', () => {
			const raw = `{"clues": [{"id":"clue:time-window","character":"${MAX}","value":"ungefähr 22 Uhr"}]}`;
			expect(parseDirectorVerdict(raw, witnessAllowed).clues).toHaveLength(1);
		});

		it('tolerates inflection when tracing a word back', () => {
			const allowed: DirectorAllowlist = {
				...witnessAllowed,
				turns: [{ who: 'Max', text: 'Sie stand bei den Garderoben.' }]
			};
			const raw = `{"clues": [{"id":"clue:time-window","character":"${MAX}","value":"an der Garderobe"}]}`;
			expect(parseDirectorVerdict(raw, allowed).clues).toHaveLength(1);
		});

		it('skips the check when the caller passed no transcript', () => {
			const raw = `{"clues": [{"id":"clue:time-window","character":"${LUCY}","value":"kurz vor eins"}]}`;
			expect(
				parseDirectorVerdict(raw, { questions: witnessQuestions, characters }).clues
			).toHaveLength(1);
		});
	});

	// Each case below is a shape a real local model produced (Chrome's native Prompt API, via
	// `/dev/story`'s director probe). Dropping them outright made the story never advance even
	// though the model had clearly understood the conversation.
	describe('near-miss shapes a real local model actually produces', () => {
		it('salvages an event the model put inside `clues` instead of `events`', () => {
			const raw = `{"clues": [{"id": "lied", "character": "${MAX}", "value": "Max"}]}`;
			expect(parseDirectorVerdict(raw, witnessAllowed)).toEqual({
				goals: [],
				flags: ['flag:lied'],
				clues: []
			});
		});

		it('resolves a character reported by display name instead of uuid', () => {
			const raw = `{"clues": [{"id": "clue:time-window", "character": "max", "value": "gegen 22 Uhr"}]}`;
			expect(parseDirectorVerdict(raw, witnessAllowed).clues).toEqual([
				{ id: 'clue:time-window', characterId: MAX, value: 'gegen 22 Uhr' }
			]);
		});

		it('still drops a name that matches no character in the scene', () => {
			const raw = `{"clues": [{"id": "clue:time-window", "character": "Hans", "value": "22 Uhr"}]}`;
			expect(parseDirectorVerdict(raw, witnessAllowed).clues).toEqual([]);
		});

		it('drops an empty claim value, which would otherwise count as a conflicting source', () => {
			const raw = `{"clues": [{"id":"clue:time-window","character":"${MAX}","value":"   "}]}`;
			expect(parseDirectorVerdict(raw, witnessAllowed).clues).toEqual([]);
		});
	});

	it('keeps only the first value per clue and character, so one source cannot contradict itself', () => {
		const allowed: DirectorAllowlist = {
			...witnessAllowed,
			characters: [...characters, { id: SABINE, name: 'Sabine' }],
			turns: [...turns, { who: 'Sabine', text: 'Eher gegen Mitternacht.' }]
		};
		const raw = JSON.stringify({
			clues: [
				{ id: 'clue:time-window', character: MAX, value: 'gegen 22 Uhr' },
				{ id: 'clue:time-window', character: MAX, value: 'Garderobe' },
				{ id: 'clue:time-window', character: SABINE, value: 'gegen Mitternacht' }
			]
		});
		expect(parseDirectorVerdict(raw, allowed).clues).toEqual([
			{ id: 'clue:time-window', characterId: MAX, value: 'gegen 22 Uhr' },
			{ id: 'clue:time-window', characterId: SABINE, value: 'gegen Mitternacht' }
		]);
	});
});

describe('the questions type', () => {
	it('is what an empty scene produces', () => {
		const empty: DirectorQuestions = buildDirectorQuestions(
			{ goals: [], exitConditions: [], revealables: [] },
			nothingYet
		);
		expect(empty).toEqual({ goals: [], events: [], outcomes: [], clueIds: [] });
	});
});
