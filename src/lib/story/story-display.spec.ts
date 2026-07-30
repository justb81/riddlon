import { describe, expect, it } from 'vitest';
import type { StoryBundle } from '$lib/content/index.js';
import { recordClueClaim, resolveClue } from '$lib/engine/clues.js';
import { createInitialState } from '$lib/engine/state.js';
import {
	achievementDisplays,
	reachedOutcomes,
	resolveClueDisplays,
	sceneProgress,
	storyThreads
} from './story-display.js';

const PKG = '11111111-1111-4111-8111-111111111111';
const LUCY = '22222222-2222-4222-8222-222222222222';
const MAX = '33333333-3333-4333-8333-333333333333';
const SCENE_LUCY_A = '44444444-4444-4444-8444-444444444444';
const SCENE_MAX = '55555555-5555-4555-8555-555555555555';
const SCENE_LUCY_B = '66666666-6666-4666-8666-666666666666';
const SCENE_GROUP = '77777777-7777-4777-8777-777777777777';
const CLUE_TIME = 'clue:time-window';
const ACHIEVEMENT = '88888888-8888-4888-8888-888888888888';

/** Two Lucy scenes on purpose: a messenger must fold them into one Lucy chat. */
function bundle(): StoryBundle {
	return {
		manifest: {
			format: 'chatstory-package',
			formatVersion: '1.0.0',
			id: PKG,
			title: 'Display Test Story',
			version: '1.0.0',
			author: 'Test',
			language: 'de',
			entryStory: 'story/story.json',
			entryGraph: 'story/graph.json',
			characters: [],
			world: [],
			assetsBase: 'assets/',
			minPlayerVersion: '0.1.0',
			capabilities: []
		},
		story: {
			castBindings: [],
			achievements: [{ id: ACHIEVEMENT, label: 'Fall gelöst', description: 'Max hat gestanden.' }],
			delayedEvents: []
		},
		graph: {
			nodes: [
				{
					id: SCENE_LUCY_A,
					type: 'chat-scene',
					participants: [LUCY],
					goals: ['introduce'],
					autoOpen: true,
					entryConditions: [],
					exitConditions: ['flag:briefed'],
					revealables: [],
					next: []
				},
				{
					id: SCENE_MAX,
					type: 'chat-scene',
					participants: [MAX],
					goals: [],
					autoOpen: true,
					entryConditions: [],
					exitConditions: [],
					revealables: [],
					next: []
				},
				{
					id: SCENE_LUCY_B,
					type: 'chat-scene',
					participants: [LUCY],
					goals: ['report-back'],
					autoOpen: true,
					entryConditions: [],
					exitConditions: [],
					revealables: [],
					next: []
				},
				{
					id: SCENE_GROUP,
					type: 'group-chat-scene',
					participants: [LUCY, MAX],
					goals: [],
					autoOpen: true,
					entryConditions: [],
					exitConditions: [],
					revealables: [],
					playerRole: 'confront',
					outcomes: [{ id: 'max-confesses', condition: 'flag:evidence-presented' }]
				}
			]
		},
		clues: [{ id: CLUE_TIME, type: 'clue', label: 'Tatzeit', confirmedBy: [], conflicting: true }],
		facts: [],
		secrets: []
	};
}

describe('sceneProgress', () => {
	it('numbers scenes in authored order and marks exactly one as current', () => {
		const b = bundle();
		const state = createInitialState(b);
		state.unlockedSceneIds.add(SCENE_LUCY_A);
		state.unlockedSceneIds.add(SCENE_MAX);
		state.completedSceneIds.add(SCENE_LUCY_A);

		const scenes = sceneProgress(b, state);
		expect(scenes.map((s) => s.index)).toEqual([1, 2, 3, 4]);
		expect(scenes.filter((s) => s.current).map((s) => s.id)).toEqual([SCENE_MAX]);
		expect(scenes[0]).toMatchObject({ done: true, unlocked: true, current: false });
		expect(scenes[3]).toMatchObject({ done: false, unlocked: false, current: false });
	});
});

describe('storyThreads', () => {
	it('folds several scenes with the same character into one solo thread', () => {
		const b = bundle();
		const state = createInitialState(b);
		state.unlockedSceneIds.add(SCENE_LUCY_A);
		state.unlockedSceneIds.add(SCENE_LUCY_B);

		const threads = storyThreads(b, state, [LUCY]);
		expect(threads).toHaveLength(1);
		expect(threads[0]).toMatchObject({
			key: LUCY,
			kind: 'solo',
			sceneIds: [SCENE_LUCY_A, SCENE_LUCY_B],
			activeSceneId: SCENE_LUCY_A
		});
	});

	it('moves the active scene on once the earlier one is completed', () => {
		const b = bundle();
		const state = createInitialState(b);
		state.unlockedSceneIds.add(SCENE_LUCY_A);
		state.unlockedSceneIds.add(SCENE_LUCY_B);
		state.completedSceneIds.add(SCENE_LUCY_A);

		expect(storyThreads(b, state, [LUCY])[0].activeSceneId).toBe(SCENE_LUCY_B);
	});

	it('hides a contact the story has not introduced yet', () => {
		const b = bundle();
		const state = createInitialState(b);
		state.unlockedSceneIds.add(SCENE_LUCY_A);
		state.unlockedSceneIds.add(SCENE_MAX);

		// Max's scene is open, but Max himself is still hidden — no phantom contact row.
		expect(storyThreads(b, state, [LUCY]).map((t) => t.key)).toEqual([LUCY]);
	});

	it('gives every unlocked group scene its own thread', () => {
		const b = bundle();
		const state = createInitialState(b);
		state.unlockedSceneIds.add(SCENE_GROUP);

		const threads = storyThreads(b, state, [LUCY, MAX]);
		expect(threads).toHaveLength(1);
		expect(threads[0]).toMatchObject({
			key: SCENE_GROUP,
			kind: 'group',
			participantIds: [LUCY, MAX]
		});
	});

	it('has no threads at all before anything is unlocked', () => {
		const b = bundle();
		expect(storyThreads(b, createInitialState(b), [LUCY, MAX])).toEqual([]);
	});
});

describe('resolveClueDisplays', () => {
	it('reports claims, conflict and resolution from engine state', () => {
		const b = bundle();
		const state = createInitialState(b);
		recordClueClaim(state, CLUE_TIME, LUCY, 'halb zwölf');
		recordClueClaim(state, CLUE_TIME, MAX, 'kurz vor eins');

		const display = resolveClueDisplays(state, b, (id) => (id === LUCY ? 'Lucy' : 'Max'))[
			CLUE_TIME
		];
		expect(display.clueLabel).toBe('Tatzeit');
		expect(display.sources).toEqual([
			{ characterId: LUCY, who: 'Lucy', value: 'halb zwölf' },
			{ characterId: MAX, who: 'Max', value: 'kurz vor eins' }
		]);
		expect(display).toMatchObject({ conflicting: true, resolved: false });

		resolveClue(state, CLUE_TIME);
		expect(resolveClueDisplays(state, b, () => 'x')[CLUE_TIME]).toMatchObject({
			conflicting: true,
			resolved: true
		});
	});
});

describe('achievementDisplays / reachedOutcomes', () => {
	it('lists declared achievements as unearned, because packages cannot say when they are earned', () => {
		const b = bundle();
		expect(achievementDisplays(b)).toEqual([
			{ id: ACHIEVEMENT, label: 'Fall gelöst', description: 'Max hat gestanden.', earned: false }
		]);
	});

	it('reports only outcomes the engine actually reached', () => {
		const b = bundle();
		const state = createInitialState(b);
		expect(reachedOutcomes(b, state)).toEqual([]);
		state.reachedOutcomeIds.add('max-confesses');
		expect(reachedOutcomes(b, state)).toEqual([{ id: 'max-confesses', sceneId: SCENE_GROUP }]);
	});
});
