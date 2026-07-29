import type { SaveRecord } from '$lib/storage/index.js';
import type { EngineState } from './state.js';

/**
 * Converts a `saveStore` record into the `EngineState` shape `StoryEngine` operates on.
 * Tolerant of records written before a given field existed (`completedSceneIds`,
 * `reachedOutcomeIds`, `unlockedCharacterIds`, `clueStates` all shipped after the original
 * savegame shape) — each defaults to empty rather than the caller ever seeing `undefined`.
 */
export function stateFromSaveRecord(record: SaveRecord): EngineState {
	const clues: EngineState['clues'] = {};
	for (const clueRecord of record.clueStates ?? []) {
		clues[clueRecord.clueId] = {
			clueId: clueRecord.clueId,
			claims: clueRecord.claims.map((claim) => ({
				characterId: claim.characterId,
				value: claim.value
			})),
			resolved: clueRecord.resolved
		};
	}

	return {
		packageId: record.packageId,
		flags: { ...record.flags },
		unlockedSceneIds: new Set(record.unlockedSceneIds),
		completedSceneIds: new Set(record.completedSceneIds ?? []),
		reachedOutcomeIds: new Set(record.reachedOutcomeIds ?? []),
		unlockedCharacterIds: new Set(record.unlockedCharacterIds ?? []),
		clues,
		pendingDelayedEvents: (record.pendingDelayedEvents ?? []).map((pending) => ({
			eventId: pending.eventId,
			dueAt: pending.dueAt,
			fired: pending.fired
		}))
	};
}

/** The subset of `SaveRecord` that `saveStore.update()` accepts — everything `EngineState` owns. */
export type SaveRecordEnginePatch = Pick<
	SaveRecord,
	| 'flags'
	| 'unlockedSceneIds'
	| 'completedSceneIds'
	| 'reachedOutcomeIds'
	| 'unlockedCharacterIds'
	| 'clueStates'
	| 'pendingDelayedEvents'
>;

export function saveRecordPatchFromState(state: EngineState): SaveRecordEnginePatch {
	return {
		flags: { ...state.flags },
		unlockedSceneIds: [...state.unlockedSceneIds],
		completedSceneIds: [...state.completedSceneIds],
		reachedOutcomeIds: [...state.reachedOutcomeIds],
		unlockedCharacterIds: [...state.unlockedCharacterIds],
		clueStates: Object.values(state.clues).map((clue) => ({
			clueId: clue.clueId,
			claims: clue.claims.map((claim) => ({ characterId: claim.characterId, value: claim.value })),
			resolved: clue.resolved
		})),
		pendingDelayedEvents: state.pendingDelayedEvents.map((pending) => ({
			eventId: pending.eventId,
			dueAt: pending.dueAt,
			fired: pending.fired
		}))
	};
}
