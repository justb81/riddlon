import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DirectorQuestions, DirectorVerdict } from '$lib/llm/director.js';
import {
	caseQuestions,
	caseTurns,
	checkCase,
	scoreCase,
	tally,
	type CaseRun,
	type DirectorCase,
	type DirectorCaseFile
} from './director-cases.js';

const scene = {
	goals: ['seed-timeline', 'seed-location'],
	exitConditions: ['flag:questioned'],
	revealables: ['clue:time-window'],
	settableFlags: ['flag:false-accusation']
};

const base: DirectorCase = {
	id: 'c',
	scene: 's',
	transcript: ['Max: Gegen 22 Uhr.', 'Du: und wo?', 'Max: An der Garderobe.'],
	expect: {
		goals: { 'seed-timeline': true, 'seed-location': false },
		events: { 'flag:false-accusation': false },
		clues: { 'clue:time-window': 'max' }
	}
};

const verdict = (v: Partial<DirectorVerdict>): DirectorVerdict => ({
	goals: [],
	flags: [],
	clues: [],
	...v
});

describe('caseQuestions / caseTurns', () => {
	it('asks what a fresh save would ask, minus goals the case says are already reached', () => {
		const q = caseQuestions(scene, { ...base, reachedGoals: ['seed-timeline'] });
		expect(q.goals).toEqual(['seed-location']);
		expect(q.events).toEqual(['flag:false-accusation']);
		expect(q.clueIds).toEqual(['clue:time-window']);
	});

	it('cuts the window and the last exchange the way the live pass does', () => {
		const { turns, lastExchange } = caseTurns(base, 2);
		expect(turns.map((t) => t.text)).toEqual(['und wo?', 'An der Garderobe.']);
		expect(lastExchange.map((t) => t.who)).toEqual(['Du', 'Max']);
	});

	it('names the player as the live pass does, by nickname', () => {
		const { turns, lastExchange } = caseTurns(base, 6, 'Alex');
		expect(turns.map((t) => t.who)).toEqual(['Max', 'Alex', 'Max']);
		expect(lastExchange.map((t) => t.who)).toEqual(['Alex', 'Max']);
	});
});

describe('checkCase', () => {
	it('accepts a case whose expectations match the questions exactly', () => {
		expect(checkCase(base, scene, ['max'])).toEqual([]);
	});

	it('names every question without an expectation and every expectation never asked', () => {
		const problems = checkCase(
			{ ...base, expect: { goals: { 'seed-timeline': true, 'seed-mood': true } } },
			scene,
			['max']
		);
		expect(problems).toEqual([
			'c: goal seed-location asked, not expected',
			'c: goal seed-mood expected, not asked',
			'c: event flag:false-accusation asked, not expected'
		]);
	});
});

describe('scoreCase', () => {
	const q: DirectorQuestions = caseQuestions(scene, base);

	it('sorts each answer into hit, miss, false positive or correct no', () => {
		const score = scoreCase(
			base,
			q,
			verdict({
				goals: ['seed-location'],
				flags: ['flag:false-accusation'],
				clues: [{ id: 'clue:time-window', characterId: 'max', value: 'gegen 22 Uhr' }]
			})
		);
		expect(score.goals).toEqual({ hit: 0, miss: 1, falsePositive: 1, correctNo: 0 });
		expect(score.events).toEqual({ hit: 0, miss: 0, falsePositive: 1, correctNo: 0 });
		expect([score.cluesFound, score.cluesExpected, score.cluesExtra]).toEqual([1, 1, 0]);
	});

	it('tells a missed ending from a false and a wrong one', () => {
		const group = {
			goals: [],
			exitConditions: [],
			revealables: [],
			outcomes: [
				{ id: 'confess', condition: 'flag:evidence' },
				{ id: 'accuse', condition: 'flag:accusation' }
			]
		};
		const want = (outcome: string): DirectorCase => ({ ...base, expect: { outcome } });
		const gq = caseQuestions(group, want('confess'));
		const pick = (flag?: string) => verdict({ flags: flag ? [flag] : [] });
		expect(scoreCase(want('confess'), gq, pick('flag:evidence')).outcome).toBe('right');
		expect(scoreCase(want('confess'), gq, pick()).outcome).toBe('missed');
		expect(scoreCase(want('none'), gq, pick('flag:accusation')).outcome).toBe('false');
		expect(scoreCase(want('confess'), gq, pick('flag:accusation')).outcome).toBe('wrong');
	});
});

describe('tally', () => {
	it('sums the cells, keeps errors and unreadable answers apart, and times answered calls', () => {
		const q = caseQuestions(scene, base);
		const run = (ms: number, error?: string, unreadable?: boolean): CaseRun => ({
			caseId: 'c',
			model: 'm',
			window: 6,
			prompt: '',
			allowlist: { questions: q, characters: [], clues: [], turns: [] },
			raw: '',
			verdict: verdict({}),
			ms,
			error,
			unreadable
		});
		const t = tally([
			{ run: run(10), score: scoreCase(base, q, verdict({ goals: ['seed-timeline'] })) },
			{ run: run(30), score: scoreCase(base, q, verdict({})) },
			{ run: run(20), score: scoreCase(base, q, verdict({})) },
			{ run: run(99, 'boom'), score: null },
			// An answer without JSON is not "no" to everything: it must not add correct no's.
			{ run: run(40, undefined, true), score: null }
		]);
		expect(t.runs).toBe(5);
		expect(t.errors).toBe(1);
		expect(t.unreadable).toBe(1);
		expect(t.goals).toEqual({ hit: 1, miss: 2, falsePositive: 0, correctNo: 3 });
		expect(t.medianMs).toBe(25);
	});
});

/**
 * Every shipped story's case file must still match its own graph: a renamed goal or a moved flag
 * would otherwise turn a measurement into noise without anyone noticing.
 */
describe('stories/*/director-cases.json', () => {
	const storiesDir = path.resolve(__dirname, '../../../../stories');
	const slugs = readdirSync(storiesDir).filter((slug) =>
		existsSync(path.join(storiesDir, slug, 'director-cases.json'))
	);

	it('exists for the reference story', () => {
		expect(slugs).toContain('lucys-portmonnaie');
	});

	it.each(slugs)('%s: every case matches what its scene asks', (slug) => {
		const read = (file: string) =>
			JSON.parse(readFileSync(path.join(storiesDir, slug, file), 'utf8'));
		const file: DirectorCaseFile = read('director-cases.json');
		const { nodes } = read('story/graph.json') as {
			nodes: (Parameters<typeof caseQuestions>[0] & {
				id: string;
				type: string;
				participants: string[];
			})[];
		};
		const ids = file.cases.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(file.runs).toBeGreaterThan(0);
		const problems = file.cases.flatMap((c) => {
			const node = nodes.find((n) => n.id === c.scene);
			return checkCase(
				c,
				node && { ...node, outcomes: node.type === 'group-chat-scene' ? node.outcomes : [] },
				node?.participants ?? []
			);
		});
		expect(problems).toEqual([]);
	});
});
