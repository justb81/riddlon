import { describe, expect, it } from 'vitest';
import {
	buildDirectorPrompt,
	claimableClueIds,
	parseDirectorVerdict,
	settableFlags,
	type DirectorScene
} from './director.js';

const LUCY = '3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f';
const MAX = '8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e';

const scene: DirectorScene = {
	goals: ['ask-about-the-club', 'reveal-identity'],
	exitConditions: ['flag:lucy-identified', 'scene-completed:some-other-scene'],
	revealables: ['clue:time-window', 'fact:club-name']
};

const allowed = {
	flags: settableFlags(scene),
	clueIds: claimableClueIds(scene),
	characters: [
		{ id: LUCY, name: 'Lucy' },
		{ id: MAX, name: 'Max' }
	]
};

describe('the scene allowlist', () => {
	it('offers only flag refs as settable and only clue refs as claimable', () => {
		// `exitConditions` and `revealables` are generic symbolic refs — a `scene-completed:`
		// condition or a `fact:` reveal is not something the director may assert.
		expect(settableFlags(scene)).toEqual(['flag:lucy-identified']);
		expect(claimableClueIds(scene)).toEqual(['clue:time-window']);
	});
});

describe('buildDirectorPrompt', () => {
	it('shows the scene’s own ids and nothing else', () => {
		const prompt = buildDirectorPrompt({
			scene,
			clues: [
				{ id: 'clue:time-window', label: 'Ungefähre Tatzeit' },
				{ id: 'clue:location', label: 'Ort' }
			],
			characters: [{ id: LUCY, name: 'Lucy' }],
			turns: [{ who: 'Lucy', text: 'Ich war kurz vor eins noch da.' }]
		});
		expect(prompt).toContain('flag:lucy-identified');
		expect(prompt).toContain('clue:time-window — Ungefähre Tatzeit');
		expect(prompt).not.toContain('scene-completed:');
		expect(prompt).not.toContain('clue:location');
		expect(prompt).toContain('Lucy: Ich war kurz vor eins noch da.');
	});

	it('says "(keine)" rather than leaving a section blank when a scene declares nothing', () => {
		const prompt = buildDirectorPrompt({
			scene: { goals: [], exitConditions: [], revealables: [] },
			clues: [],
			characters: [],
			turns: []
		});
		expect(prompt).toContain('(keine)');
	});
});

describe('parseDirectorVerdict', () => {
	it('reads a clean answer', () => {
		const raw = `{"flags":["flag:lucy-identified"],"clues":[{"id":"clue:time-window","character":"${MAX}","value":"kurz vor eins"}]}`;
		expect(parseDirectorVerdict(raw, allowed)).toEqual({
			flags: ['flag:lucy-identified'],
			clues: [{ id: 'clue:time-window', characterId: MAX, value: 'kurz vor eins' }]
		});
	});

	it('digs the object out of surrounding prose and code fences', () => {
		const raw = `Sicher! \`\`\`json\n{"flags": ["flag:lucy-identified"], "clues": []}\n\`\`\` Fertig.`;
		expect(parseDirectorVerdict(raw, allowed).flags).toEqual(['flag:lucy-identified']);
	});

	it('is not confused by braces inside strings', () => {
		const raw = `{"flags": [], "clues": [{"id":"clue:time-window","character":"${LUCY}","value":"gegen {23:30}"}]}`;
		expect(parseDirectorVerdict(raw, allowed).clues[0].value).toBe('gegen {23:30}');
	});

	it('drops ids the scene never declared', () => {
		const raw = `{"flags":["flag:evidence-presented","flag:lucy-identified"],"clues":[{"id":"clue:location","character":"${LUCY}","value":"Garderobe"}]}`;
		expect(parseDirectorVerdict(raw, allowed)).toEqual({
			flags: ['flag:lucy-identified'],
			clues: []
		});
	});

	it('drops a claim from an unknown character', () => {
		const raw = `{"flags":[],"clues":[{"id":"clue:time-window","character":"someone-else","value":"halb zwölf"}]}`;
		expect(parseDirectorVerdict(raw, allowed).clues).toEqual([]);
	});

	it('drops an empty claim value, which would otherwise count as a conflicting source', () => {
		const raw = `{"flags":[],"clues":[{"id":"clue:time-window","character":"${LUCY}","value":"   "}]}`;
		expect(parseDirectorVerdict(raw, allowed).clues).toEqual([]);
	});

	it('de-duplicates repeated flags', () => {
		const raw = `{"flags":["flag:lucy-identified","flag:lucy-identified"],"clues":[]}`;
		expect(parseDirectorVerdict(raw, allowed).flags).toEqual(['flag:lucy-identified']);
	});

	it.each([
		['no json at all', 'Ich bin mir nicht sicher.'],
		['broken json', '{"flags": ["flag:lucy-identified",}'],
		['an empty answer', ''],
		['wrong field types', '{"flags": "flag:lucy-identified", "clues": "none"}']
	])('returns an empty verdict for %s', (_label, raw) => {
		expect(parseDirectorVerdict(raw, allowed)).toEqual({ flags: [], clues: [] });
	});

	it('unwraps a verdict the model put inside an array', () => {
		// Leniency is free here: whatever comes out still has to survive the id allowlist.
		const raw = '[{"flags":["flag:lucy-identified"],"clues":[]}]';
		expect(parseDirectorVerdict(raw, allowed).flags).toEqual(['flag:lucy-identified']);
	});

	// The remaining cases below are not hypothetical: each is the actual raw answer a real local
	// model (Chrome's native Prompt API, via `/dev/story`'s director probe) gave for this exact
	// scene, reproduced live against the real conversation from the reported bug. Dropping them
	// outright is what made Lucy's identification — and later the witness names — never advance
	// the graph, even though the model had clearly understood the conversation.
	describe('near-miss shapes a real local model actually produces', () => {
		it('accepts a flag reported as a bare id, missing its "flag:" prefix', () => {
			const raw = '{"flags": ["lucy-identified"], "clues": []}';
			expect(parseDirectorVerdict(raw, allowed).flags).toEqual(['flag:lucy-identified']);
		});

		it('salvages a flag-shaped event the model put inside `clues` instead of `flags`', () => {
			// The exact answer reproduced live: the model recognised "Ich bin Lucy" as the scene's
			// exit condition, but reported it as a clue claim rather than a flag.
			const raw = `{"flags": [], "clues": [{"id": "lucy-identified", "character": "${LUCY}", "value": "Lucy"}]}`;
			expect(parseDirectorVerdict(raw, allowed)).toEqual({
				flags: ['flag:lucy-identified'],
				clues: []
			});
		});

		it('does not salvage a clue id that also happens to not be a real flag', () => {
			const raw = `{"flags": [], "clues": [{"id": "clue:nonexistent", "character": "${LUCY}", "value": "x"}]}`;
			expect(parseDirectorVerdict(raw, allowed)).toEqual({ flags: [], clues: [] });
		});

		it('resolves a character reported by display name instead of uuid', () => {
			const raw = `{"flags": [], "clues": [{"id": "clue:time-window", "character": "lucy", "value": "kurz vor eins"}]}`;
			expect(parseDirectorVerdict(raw, allowed).clues).toEqual([
				{ id: 'clue:time-window', characterId: LUCY, value: 'kurz vor eins' }
			]);
		});

		it('still drops a name that matches no character in the scene', () => {
			const raw = `{"flags": [], "clues": [{"id": "clue:time-window", "character": "Hans", "value": "x"}]}`;
			expect(parseDirectorVerdict(raw, allowed).clues).toEqual([]);
		});
	});
});

/**
 * A group scene ships no `exitConditions` on purpose (`engine/graph.ts` would otherwise complete
 * it the moment it unlocks), so its outcome conditions are the only settable flags it has — and
 * without them no authored ending in the reference story was reachable in play at all.
 */
describe('settableFlags — group-scene outcomes', () => {
	it('lets the director set the flags a group scene’s outcomes are conditioned on', () => {
		expect(
			settableFlags({
				goals: ['resolve-case'],
				exitConditions: [],
				revealables: [],
				outcomeConditions: ['flag:evidence-presented', 'flag:false-accusation']
			})
		).toEqual(['flag:evidence-presented', 'flag:false-accusation']);
	});

	it('never makes a negated condition settable', () => {
		expect(
			settableFlags({
				goals: [],
				exitConditions: [],
				revealables: [],
				// "…and the player never wrongly accused anyone" must not be assertable by the model.
				outcomeConditions: ['not:flag:false-accusation', 'clue-known:clue:time-window']
			})
		).toEqual([]);
	});

	it('merges exit conditions with outcome conditions without duplicating', () => {
		expect(
			settableFlags({
				goals: [],
				exitConditions: ['flag:done', 'scene-completed:x'],
				revealables: [],
				outcomeConditions: ['flag:done', 'flag:extra']
			})
		).toEqual(['flag:done', 'flag:extra']);
	});
});
