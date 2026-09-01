import { describe, expect, it } from 'vitest';
import { confirmedSourceCount, isClueConflicting, recordClueClaim, resolveClue } from './clues.js';
import type { EngineState } from './state.js';

const MAX_ID = 'max-uuid';
const SABINE_ID = 'sabine-uuid';
const CLUE_ID = 'clue:time-window';

function emptyState(): EngineState {
	return {
		packageId: 'pkg',
		flags: {},
		unlockedSceneIds: new Set(),
		completedSceneIds: new Set(),
		reachedOutcomeIds: new Set(),
		unlockedCharacterIds: new Set(),
		clues: {},
		pendingDelayedEvents: [],
		earnedAchievementIds: new Set()
	};
}

describe('recordClueClaim / isClueConflicting', () => {
	it('two sources with different claims both persist — neither overwrites the other', () => {
		const state = emptyState();
		recordClueClaim(state, CLUE_ID, MAX_ID, 'gegen 22 Uhr');
		recordClueClaim(state, CLUE_ID, SABINE_ID, 'gegen Mitternacht');

		expect(state.clues[CLUE_ID].claims).toEqual([
			{ characterId: MAX_ID, value: 'gegen 22 Uhr' },
			{ characterId: SABINE_ID, value: 'gegen Mitternacht' }
		]);
	});

	it('flags conflicting: true once 2 distinct values exist, and reports it exactly once', () => {
		const state = emptyState();
		recordClueClaim(state, CLUE_ID, MAX_ID, 'gegen 22 Uhr');
		expect(isClueConflicting(state, CLUE_ID)).toBe(false);

		const effects = recordClueClaim(state, CLUE_ID, SABINE_ID, 'gegen Mitternacht');
		expect(isClueConflicting(state, CLUE_ID)).toBe(true);
		expect(effects).toContainEqual({ type: 'clue-conflict-detected', clueId: CLUE_ID });

		// A third claim doesn't re-fire the conflict-detected effect.
		const thirdEffects = recordClueClaim(state, CLUE_ID, MAX_ID, 'gegen Mitternacht');
		expect(thirdEffects.some((e) => e.type === 'clue-conflict-detected')).toBe(false);
	});

	it('an exact repeat of an already-recorded claim is a no-op', () => {
		const state = emptyState();
		recordClueClaim(state, CLUE_ID, MAX_ID, 'gegen 22 Uhr');
		const effects = recordClueClaim(state, CLUE_ID, MAX_ID, 'gegen 22 Uhr');
		expect(effects).toEqual([]);
		expect(state.clues[CLUE_ID].claims).toHaveLength(1);
	});

	it('auto-vivifies a clue not previously in state', () => {
		const state = emptyState();
		expect(state.clues[CLUE_ID]).toBeUndefined();
		recordClueClaim(state, CLUE_ID, MAX_ID, 'gegen 22 Uhr');
		expect(state.clues[CLUE_ID]).toBeDefined();
	});
});

describe('confirmedSourceCount', () => {
	it('counts DISTINCT character sources, not total claims', () => {
		const state = emptyState();
		recordClueClaim(state, CLUE_ID, MAX_ID, 'gegen 22 Uhr');
		expect(confirmedSourceCount(state, CLUE_ID)).toBe(1);
		recordClueClaim(state, CLUE_ID, MAX_ID, 'gegen Mitternacht');
		expect(confirmedSourceCount(state, CLUE_ID)).toBe(1);
		recordClueClaim(state, CLUE_ID, SABINE_ID, 'gegen Mitternacht');
		expect(confirmedSourceCount(state, CLUE_ID)).toBe(2);
	});

	it('is 0 for a clue with no recorded claims', () => {
		expect(confirmedSourceCount(emptyState(), CLUE_ID)).toBe(0);
	});
});

describe('resolveClue', () => {
	it('marks a conflicting clue resolved without changing its recorded claims', () => {
		const state = emptyState();
		recordClueClaim(state, CLUE_ID, MAX_ID, 'gegen 22 Uhr');
		recordClueClaim(state, CLUE_ID, SABINE_ID, 'gegen Mitternacht');

		const effects = resolveClue(state, CLUE_ID);
		expect(effects).toEqual([{ type: 'clue-resolved', clueId: CLUE_ID }]);
		expect(state.clues[CLUE_ID].resolved).toBe(true);
		expect(isClueConflicting(state, CLUE_ID)).toBe(true); // claims themselves are unchanged
	});

	it('is idempotent — resolving an already-resolved clue is a no-op', () => {
		const state = emptyState();
		recordClueClaim(state, CLUE_ID, MAX_ID, 'a');
		recordClueClaim(state, CLUE_ID, SABINE_ID, 'b');
		resolveClue(state, CLUE_ID);
		expect(resolveClue(state, CLUE_ID)).toEqual([]);
	});

	it('is a no-op for an unknown clue id', () => {
		expect(resolveClue(emptyState(), 'clue:does-not-exist')).toEqual([]);
	});
});
