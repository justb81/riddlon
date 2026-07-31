import { describe, expect, it } from 'vitest';
import type { StoryBundle } from '$lib/content/index.js';
import { recordClueClaim, resolveClue } from './clues.js';
import { createInitialState } from './state.js';
import {
	isCharacterVisible,
	isIdentityRevealed,
	maskedCharacterIds,
	progress,
	recompute,
	visibleCharacterIds
} from './graph.js';

const PACKAGE_ID = '11111111-1111-4111-8111-111111111111';
const LUCY_ID = '22222222-2222-4222-8222-222222222222';
const MAX_ID = '33333333-3333-4333-8333-333333333333';
const SCENE_QUESTIONING = '44444444-4444-4444-8444-444444444444';
const SCENE_REPORT = '55555555-5555-4555-8555-555555555555';
const SCENE_GROUP = '66666666-6666-4666-8666-666666666666';
const CLUE_TIME = 'clue:time-window';
const CLUE_PLACE = 'clue:place';

/** `makeTestBundle()` ships no clues, so the clue-count cases declare their own two. */
function withClues(bundle: StoryBundle): StoryBundle {
	return {
		...bundle,
		clues: [
			{
				id: CLUE_TIME,
				type: 'clue',
				label: 'Tatzeit',
				confirmedBy: [LUCY_ID, MAX_ID],
				conflicting: true
			},
			{ id: CLUE_PLACE, type: 'clue', label: 'Ort', confirmedBy: [LUCY_ID], conflicting: false }
		]
	};
}

/** Minimal hand-built bundle: Lucy visible from start, Max hidden until "flag:max-unlocked". */
function makeTestBundle(): StoryBundle {
	return {
		manifest: {
			format: 'chatstory-package',
			formatVersion: '1.0.0',
			id: PACKAGE_ID,
			title: 'Graph Test Story',
			version: '0.1.0',
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
			castBindings: [
				{
					characterRef: LUCY_ID,
					roleInStory: 'quest-giver',
					knowledge: { publicFacts: [], secrets: [] },
					availability: { initialState: 'visible' },
					relationships: {},
					identityMask: {
						maskedDisplayName: 'Unbekannt',
						revealCondition: 'flag:lucy-identified'
					}
				},
				{
					characterRef: MAX_ID,
					roleInStory: 'witness',
					knowledge: { publicFacts: [], secrets: [] },
					availability: { initialState: 'hidden', unlockCondition: 'flag:max-unlocked' },
					relationships: {}
				}
			],
			achievements: [],
			delayedEvents: []
		},
		graph: {
			nodes: [
				{
					id: SCENE_QUESTIONING,
					type: 'chat-scene',
					participants: [MAX_ID],
					goals: [],
					autoOpen: true,
					entryConditions: ['flag:max-unlocked'],
					exitConditions: ['flag:max-questioned'],
					revealables: [],
					next: [{ target: SCENE_REPORT, when: [] }]
				},
				{
					id: SCENE_REPORT,
					type: 'chat-scene',
					participants: [LUCY_ID],
					goals: [],
					autoOpen: true,
					entryConditions: [],
					exitConditions: ['flag:report-done'],
					revealables: [],
					next: [{ target: SCENE_GROUP, when: ['flag:evidence-confirmed'] }]
				},
				{
					id: SCENE_GROUP,
					type: 'group-chat-scene',
					participants: [LUCY_ID, MAX_ID],
					goals: [],
					autoOpen: true,
					entryConditions: [],
					exitConditions: [],
					revealables: [],
					playerRole: 'confront',
					outcomes: [{ id: 'max-confesses', condition: 'flag:confession-done' }]
				}
			]
		},
		clues: [],
		facts: [],
		secrets: []
	};
}

describe('recompute', () => {
	it('unlocks a scene with zero entryConditions immediately', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		const effects = recompute(state, bundle);
		expect(state.unlockedSceneIds.has(SCENE_REPORT)).toBe(true);
		expect(effects).toContainEqual({ type: 'scene-unlocked', sceneId: SCENE_REPORT });
	});

	it('does not unlock a scene until its entryConditions hold', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		recompute(state, bundle);
		expect(state.unlockedSceneIds.has(SCENE_QUESTIONING)).toBe(false);

		state.flags['flag:max-unlocked'] = true;
		recompute(state, bundle);
		expect(state.unlockedSceneIds.has(SCENE_QUESTIONING)).toBe(true);
	});

	it('a scene with zero exitConditions never auto-completes', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		recompute(state, bundle);
		expect(state.unlockedSceneIds.has(SCENE_GROUP)).toBe(true);
		expect(state.completedSceneIds.has(SCENE_GROUP)).toBe(false);
	});

	it('completes a scene once its exitConditions hold and unlocks the next[] target whose when holds', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		recompute(state, bundle);
		state.flags['flag:report-done'] = true;
		state.flags['flag:evidence-confirmed'] = true;
		const effects = recompute(state, bundle);
		expect(state.completedSceneIds.has(SCENE_REPORT)).toBe(true);
		expect(effects).toContainEqual({ type: 'scene-completed', sceneId: SCENE_REPORT });
		// SCENE_GROUP was already unlocked (zero entryConditions), so no duplicate unlock effect,
		// but the transition's `when` is satisfied too.
		expect(state.unlockedSceneIds.has(SCENE_GROUP)).toBe(true);
	});

	it('fires a group-chat-scene outcome once its condition holds, exactly once', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		recompute(state, bundle);
		state.flags['flag:confession-done'] = true;
		const effects = recompute(state, bundle);
		expect(effects).toContainEqual({
			type: 'outcome-reached',
			sceneId: SCENE_GROUP,
			outcomeId: 'max-confesses'
		});
		expect(state.reachedOutcomeIds.has('max-confesses')).toBe(true);

		const secondPass = recompute(state, bundle);
		expect(secondPass).toEqual([]);
	});

	it('propagates through chained entry conditions in a single call (fixed point)', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		state.flags['flag:max-unlocked'] = true;
		state.flags['flag:max-questioned'] = true;
		state.flags['flag:report-done'] = true;
		state.flags['flag:evidence-confirmed'] = true;
		recompute(state, bundle);
		expect(state.completedSceneIds.has(SCENE_QUESTIONING)).toBe(true);
		expect(state.completedSceneIds.has(SCENE_REPORT)).toBe(true);
		expect(state.unlockedSceneIds.has(SCENE_GROUP)).toBe(true);
	});
});

describe('isCharacterVisible / visibleCharacterIds', () => {
	it('a character with initialState "visible" is always visible', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		expect(isCharacterVisible(LUCY_ID, bundle, state)).toBe(true);
	});

	it('a hidden character becomes visible once its unlockCondition holds', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		expect(isCharacterVisible(MAX_ID, bundle, state)).toBe(false);
		state.flags['flag:max-unlocked'] = true;
		expect(isCharacterVisible(MAX_ID, bundle, state)).toBe(true);
	});

	it('visibleCharacterIds reflects both characters once conditions are met', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		state.flags['flag:max-unlocked'] = true;
		expect(visibleCharacterIds(bundle, state)).toEqual(new Set([LUCY_ID, MAX_ID]));
	});

	it('an explicit unlock-character action makes a character visible regardless of conditions', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		state.unlockedCharacterIds.add(MAX_ID);
		expect(isCharacterVisible(MAX_ID, bundle, state)).toBe(true);
	});
});

describe('isIdentityRevealed / maskedCharacterIds', () => {
	it('a character with an identityMask is masked until its revealCondition holds', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		expect(isIdentityRevealed(LUCY_ID, bundle, state)).toBe(false);
		state.flags['flag:lucy-identified'] = true;
		expect(isIdentityRevealed(LUCY_ID, bundle, state)).toBe(true);
	});

	it('a binding with no identityMask is always revealed', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		expect(isIdentityRevealed(MAX_ID, bundle, state)).toBe(true);
	});

	it('maskedCharacterIds reflects only the masked, not-yet-revealed character', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		expect(maskedCharacterIds(bundle, state)).toEqual(new Set([LUCY_ID]));
		state.flags['flag:lucy-identified'] = true;
		expect(maskedCharacterIds(bundle, state)).toEqual(new Set());
	});
});

describe('progress', () => {
	it('reports scene/outcome counts', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		recompute(state, bundle);
		const summary = progress(state, bundle);
		expect(summary.totalSceneCount).toBe(3);
		expect(summary.completedSceneCount).toBe(0);
		expect(summary.unlockedSceneIds).toContain(SCENE_REPORT);
	});

	it('counts a clue as known from its first claim, not from being declared', () => {
		const bundle = withClues(makeTestBundle());
		const state = createInitialState(bundle);

		expect(progress(state, bundle)).toMatchObject({
			knownClueCount: 0,
			totalClueCount: 2,
			openContradictionCount: 0
		});

		recordClueClaim(state, CLUE_TIME, LUCY_ID, 'halb zwölf');
		expect(progress(state, bundle)).toMatchObject({
			knownClueCount: 1,
			openContradictionCount: 0
		});
	});

	it('opens a contradiction on a second distinct value and closes it on resolveClue', () => {
		const bundle = withClues(makeTestBundle());
		const state = createInitialState(bundle);
		recordClueClaim(state, CLUE_TIME, LUCY_ID, 'halb zwölf');
		recordClueClaim(state, CLUE_TIME, MAX_ID, 'kurz vor eins');

		expect(progress(state, bundle).openContradictionCount).toBe(1);

		resolveClue(state, CLUE_TIME);
		const resolved = progress(state, bundle);
		// Resolving closes the contradiction without forgetting that the clue is known — the
		// claims themselves are never dropped (see `clues.ts`).
		expect(resolved.openContradictionCount).toBe(0);
		expect(resolved.knownClueCount).toBe(1);
	});
});
