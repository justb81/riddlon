import type { StoryBundle } from '$lib/content/index.js';
import type { EvaluationContext } from './conditions.js';
import type { EngineAction } from './actions.js';

/** One source's claim about a clue — see docs/arc42 §8.1.5 and #8's acceptance criteria. */
export interface ClueClaim {
	characterId: string;
	value: string;
}

export interface ClueRuntimeState {
	clueId: string;
	/** Every recorded claim, in recording order — a later claim never overwrites an earlier one. */
	claims: ClueClaim[];
	resolved: boolean;
}

export interface PendingDelayedEventState {
	eventId: string;
	/** ISO timestamp; due once `now >= dueAt`. */
	dueAt: string;
	fired: boolean;
}

/**
 * Mutable runtime state for one playthrough of one installed package. Deliberately plain,
 * JSON-serializable data (no class instances, no Svelte runes) so `persistence.ts` can
 * round-trip it through `saveStore` without any framework in between.
 */
export interface EngineState {
	packageId: string;
	/** Keyed by the FULL symbolic ref, e.g. "flag:max-questioned" — matches `saveStore`'s shape. */
	flags: Record<string, boolean>;
	unlockedSceneIds: Set<string>;
	completedSceneIds: Set<string>;
	reachedOutcomeIds: Set<string>;
	/** Characters force-unlocked via an `unlock-character:` action, independent of castBinding availability. */
	unlockedCharacterIds: Set<string>;
	clues: Record<string, ClueRuntimeState>;
	pendingDelayedEvents: PendingDelayedEventState[];
	/** Achievements whose `conditions` have held at least once — sticky, so an achievement is
	 *  earned exactly once and a later state change never takes it back (#32). */
	earnedAchievementIds: Set<string>;
}

/** Every mutation the engine can produce — the sole contract `ui/` and `llm/` observe. */
export type EngineEffect =
	| { type: 'flag-set'; flag: string }
	| { type: 'scene-unlocked'; sceneId: string }
	| { type: 'scene-completed'; sceneId: string }
	| { type: 'outcome-reached'; sceneId: string; outcomeId: string }
	| { type: 'character-unlocked'; characterId: string }
	| { type: 'clue-recorded'; clueId: string; characterId: string; value: string }
	| { type: 'clue-conflict-detected'; clueId: string }
	| { type: 'clue-resolved'; clueId: string }
	| { type: 'achievement-earned'; achievementId: string }
	| { type: 'delayed-event-armed'; eventId: string; dueAt: string }
	| { type: 'delayed-event-fired'; eventId: string; action: EngineAction | undefined }
	/** Came due while its `condition` no longer held (#33). `rearmed` distinguishes the two
	 *  authored reactions: dropped for good, or put back to pending for a later resume. */
	| { type: 'delayed-event-cancelled'; eventId: string; rearmed: boolean };

/** Fresh state for a newly-started playthrough — every clue in the bundle starts with no claims. */
export function createInitialState(bundle: StoryBundle): EngineState {
	const clues: Record<string, ClueRuntimeState> = {};
	for (const clue of bundle.clues) {
		clues[clue.id] = { clueId: clue.id, claims: [], resolved: false };
	}
	return {
		packageId: bundle.manifest.id,
		flags: {},
		unlockedSceneIds: new Set(),
		completedSceneIds: new Set(),
		reachedOutcomeIds: new Set(),
		unlockedCharacterIds: new Set(),
		clues,
		pendingDelayedEvents: [],
		earnedAchievementIds: new Set()
	};
}

/** Distinct character-source count for a clue — the #8 evidence-gate primitive. */
export function confirmedSourceCount(state: EngineState, clueId: string): number {
	const clue = state.clues[clueId];
	if (!clue) return 0;
	return new Set(clue.claims.map((claim) => claim.characterId)).size;
}

/** Assembles the `conditions.ts` evaluation context from current state + the story bundle. */
export function buildEvaluationContext(state: EngineState, bundle: StoryBundle): EvaluationContext {
	const clueSourceCounts: Record<string, number> = {};
	const knownClueIds = new Set<string>();
	const resolvedClueIds = new Set<string>();
	for (const clue of Object.values(state.clues)) {
		clueSourceCounts[clue.clueId] = confirmedSourceCount(state, clue.clueId);
		if (clue.claims.length > 0) knownClueIds.add(clue.clueId);
		if (clue.resolved) resolvedClueIds.add(clue.clueId);
	}

	const secretRevealConditions: Record<string, string> = {};
	for (const secret of bundle.secrets) {
		secretRevealConditions[secret.id] = secret.revealCondition;
	}

	return {
		flags: state.flags,
		unlockedSceneIds: state.unlockedSceneIds,
		completedSceneIds: state.completedSceneIds,
		clueSourceCounts,
		knownClueIds,
		resolvedClueIds,
		reachedOutcomeIds: state.reachedOutcomeIds,
		secretRevealConditions
	};
}

/** Mutates `state` in place per `action`; returns the effect(s) produced (empty if already applied). */
export function applyEngineAction(state: EngineState, action: EngineAction): EngineEffect[] {
	switch (action.type) {
		case 'unlock-scene': {
			if (state.unlockedSceneIds.has(action.sceneId)) return [];
			state.unlockedSceneIds.add(action.sceneId);
			return [{ type: 'scene-unlocked', sceneId: action.sceneId }];
		}
		case 'set-flag': {
			if (state.flags[action.flag] === true) return [];
			state.flags[action.flag] = true;
			return [{ type: 'flag-set', flag: action.flag }];
		}
		case 'unlock-character': {
			if (state.unlockedCharacterIds.has(action.characterId)) return [];
			state.unlockedCharacterIds.add(action.characterId);
			return [{ type: 'character-unlocked', characterId: action.characterId }];
		}
	}
}
