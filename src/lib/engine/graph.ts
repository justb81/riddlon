import type { StoryBundle } from '$lib/content/index.js';
import { evaluateAll, evaluateCondition } from './conditions.js';
import { buildEvaluationContext, type EngineEffect, type EngineState } from './state.js';

/**
 * Recomputes scene unlocks/completions/outcomes to a fixed point (docs/concept.md §5.4,
 * §5.7). Loops because one scene's completion can unlock another whose `entryConditions`
 * reference `scene-unlocked:`/`scene-completed:`, so a single pass isn't always enough.
 *
 * A scene with zero `exitConditions` deliberately never auto-completes — `evaluateAll([])`
 * is vacuously true, which would otherwise instantly "complete" e.g. the group-confrontation
 * scene the moment it unlocks. Zero `entryConditions`, by contrast, correctly means "open
 * from story start" and is not special-cased.
 */
export function recompute(state: EngineState, bundle: StoryBundle): EngineEffect[] {
	const effects: EngineEffect[] = [];
	let changed = true;

	while (changed) {
		changed = false;
		const ctx = buildEvaluationContext(state, bundle);

		for (const node of bundle.graph.nodes) {
			if (state.unlockedSceneIds.has(node.id)) continue;
			if (evaluateAll(node.entryConditions, ctx).value) {
				state.unlockedSceneIds.add(node.id);
				effects.push({ type: 'scene-unlocked', sceneId: node.id });
				changed = true;
			}
		}

		for (const node of bundle.graph.nodes) {
			if (!state.unlockedSceneIds.has(node.id)) continue;

			if (
				!state.completedSceneIds.has(node.id) &&
				node.exitConditions.length > 0 &&
				evaluateAll(node.exitConditions, ctx).value
			) {
				state.completedSceneIds.add(node.id);
				effects.push({ type: 'scene-completed', sceneId: node.id });
				changed = true;

				if (node.type === 'chat-scene') {
					for (const transition of node.next) {
						if (state.unlockedSceneIds.has(transition.target)) continue;
						if (evaluateAll(transition.when, ctx).value) {
							state.unlockedSceneIds.add(transition.target);
							effects.push({ type: 'scene-unlocked', sceneId: transition.target });
							changed = true;
						}
					}
				}
			}

			if (node.type === 'group-chat-scene') {
				for (const outcome of node.outcomes) {
					if (state.reachedOutcomeIds.has(outcome.id)) continue;
					if (evaluateCondition(outcome.condition, ctx)) {
						state.reachedOutcomeIds.add(outcome.id);
						effects.push({ type: 'outcome-reached', sceneId: node.id, outcomeId: outcome.id });
						changed = true;
					}
				}
			}
		}
	}

	return effects;
}

/** Chat-overview contact-unlock behaviour: visible/hidden per castBinding + participation. */
export function isCharacterVisible(
	characterId: string,
	bundle: StoryBundle,
	state: EngineState
): boolean {
	if (state.unlockedCharacterIds.has(characterId)) return true;

	const binding = bundle.story.castBindings.find((b) => b.characterRef === characterId);
	if (binding) {
		if (binding.availability.initialState === 'visible') return true;
		if (
			binding.availability.unlockCondition &&
			evaluateCondition(binding.availability.unlockCondition, buildEvaluationContext(state, bundle))
		) {
			return true;
		}
	}

	return bundle.graph.nodes.some(
		(node) => state.unlockedSceneIds.has(node.id) && node.participants.includes(characterId)
	);
}

export function visibleCharacterIds(bundle: StoryBundle, state: EngineState): Set<string> {
	const ids = new Set(bundle.story.castBindings.map((b) => b.characterRef));
	return new Set([...ids].filter((id) => isCharacterVisible(id, bundle, state)));
}

export interface ProgressSummary {
	unlockedSceneIds: string[];
	completedSceneIds: string[];
	totalSceneCount: number;
	completedSceneCount: number;
	reachedOutcomeIds: string[];
}

/** Feeds the "Storyübersicht" milestone screen (#ui-story-overview) and chat-overview progress bar. */
export function progress(state: EngineState, bundle: StoryBundle): ProgressSummary {
	return {
		unlockedSceneIds: [...state.unlockedSceneIds],
		completedSceneIds: [...state.completedSceneIds],
		totalSceneCount: bundle.graph.nodes.length,
		completedSceneCount: state.completedSceneIds.size,
		reachedOutcomeIds: [...state.reachedOutcomeIds]
	};
}
