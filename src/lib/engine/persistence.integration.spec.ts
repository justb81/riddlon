import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryBundle } from '$lib/content/index.js';
import type { SaveRecord } from '$lib/storage/index.js';
import { saveRecordPatchFromState, stateFromSaveRecord } from './persistence.js';
import { createInitialState } from './state.js';
import { recordClueClaim } from './clues.js';

const MINIMAL_BUNDLE = { manifest: { id: 'pkg-1' }, clues: [] } as unknown as StoryBundle;

vi.mock('$app/environment', () => ({ browser: true }));

describe('persistence (real IndexedDB via fake-indexeddb)', () => {
	beforeEach(async () => {
		const { resetDbConnectionForTests, DB_NAME } = await import('$lib/storage/db.js');
		await resetDbConnectionForTests();
		await new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase(DB_NAME);
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});
	});

	it('round-trips EngineState through saveStore across a simulated reload', async () => {
		const { saveStore } = await import('$lib/storage/save-store.js');
		const state = createInitialState(MINIMAL_BUNDLE);
		state.flags['flag:max-questioned'] = true;
		state.unlockedSceneIds.add('scene-1');
		state.completedSceneIds.add('scene-1');
		state.reachedOutcomeIds.add('max-confesses');
		state.unlockedCharacterIds.add('char-1');
		recordClueClaim(state, 'clue:time-window', 'max', '22 Uhr');
		recordClueClaim(state, 'clue:time-window', 'sabine', 'Mitternacht');
		state.pendingDelayedEvents.push({
			eventId: 'event:followup',
			dueAt: '2026-01-01T00:00:00.000Z',
			fired: false
		});

		const save = await saveStore.createForPackage('pkg-1');
		await saveStore.update(save!.id, saveRecordPatchFromState(state));

		const { resetDbConnectionForTests } = await import('$lib/storage/db.js');
		await resetDbConnectionForTests(); // simulate a fresh page load

		const reloaded = await saveStore.get(save!.id);
		const restoredState = stateFromSaveRecord(reloaded!);

		expect(restoredState.flags).toEqual({ 'flag:max-questioned': true });
		expect(restoredState.unlockedSceneIds).toEqual(new Set(['scene-1']));
		expect(restoredState.completedSceneIds).toEqual(new Set(['scene-1']));
		expect(restoredState.reachedOutcomeIds).toEqual(new Set(['max-confesses']));
		expect(restoredState.unlockedCharacterIds).toEqual(new Set(['char-1']));
		expect(restoredState.clues['clue:time-window'].claims).toEqual([
			{ characterId: 'max', value: '22 Uhr' },
			{ characterId: 'sabine', value: 'Mitternacht' }
		]);
		expect(restoredState.pendingDelayedEvents).toEqual([
			{ eventId: 'event:followup', dueAt: '2026-01-01T00:00:00.000Z', fired: false }
		]);
	});
});

describe('stateFromSaveRecord', () => {
	it('defaults fields absent on a record written before they existed, instead of throwing', () => {
		const legacyRecord = {
			id: 'save-1',
			packageId: 'pkg-1',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			flags: { 'flag:a': true },
			unlockedSceneIds: ['scene-1'],
			chatHistory: []
			// completedSceneIds, reachedOutcomeIds, unlockedCharacterIds, clueStates,
			// pendingDelayedEvents all absent — as an older SaveRecord would have them.
		} as unknown as SaveRecord;

		const state = stateFromSaveRecord(legacyRecord);
		expect(state.completedSceneIds).toEqual(new Set());
		expect(state.reachedOutcomeIds).toEqual(new Set());
		expect(state.unlockedCharacterIds).toEqual(new Set());
		expect(state.clues).toEqual({});
		expect(state.pendingDelayedEvents).toEqual([]);
		expect(state.earnedAchievementIds).toEqual(new Set());
		expect(state.flags).toEqual({ 'flag:a': true });
	});
});
