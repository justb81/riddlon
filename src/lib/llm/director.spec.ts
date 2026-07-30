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
	characterIds: [LUCY, MAX]
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
});
