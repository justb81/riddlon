/**
 * Pure derivations from "the active package + its engine state" that the UI needs — scene
 * timeline, clue panels, achievement list, chat threads.
 *
 * Everything here used to be hardcoded for the built-in demo story (`reference-progress.ts`'s
 * `MILESTONE_DEFS`/`ACHIEVEMENT_DEFS` and `lucys-portmonnaie.ts`'s `CHARACTERS`). It is now
 * computed from whatever package is installed, which is the whole point: no module under
 * `src/lib/` knows a character or a package id any more.
 *
 * Framework-free and browser-free on purpose, so it runs under the Node test project.
 */

import type { StoryBundle } from '$lib/content/index.js';
import { isClueConflicting } from '$lib/engine/clues.js';
import type { EngineState } from '$lib/engine/index.js';

export interface ClueDisplayClaim {
	characterId: string;
	who: string;
	value: string;
}

export interface ClueDisplay {
	clueLabel: string;
	sources: ClueDisplayClaim[];
	conflicting: boolean;
	resolved: boolean;
}

/**
 * The "WIDERSPRUCH: …" panel's contents, straight from `EngineState.clues[…].claims` (#35).
 * Keyed by clue id, so a message only has to know which clue it is about.
 */
export function resolveClueDisplays(
	state: EngineState,
	bundle: StoryBundle,
	displayNameFor: (characterId: string) => string
): Record<string, ClueDisplay> {
	const displays: Record<string, ClueDisplay> = {};
	for (const clue of bundle.clues) {
		const runtime = state.clues[clue.id];
		displays[clue.id] = {
			clueLabel: clue.label,
			sources: (runtime?.claims ?? []).map((claim) => ({
				characterId: claim.characterId,
				who: displayNameFor(claim.characterId),
				value: claim.value
			})),
			conflicting: isClueConflicting(state, clue.id),
			resolved: runtime?.resolved ?? false
		};
	}
	return displays;
}

export interface SceneProgress {
	id: string;
	/** 1-based position in the authored graph — the "Kapitel n" the UI shows. */
	index: number;
	type: string;
	participantIds: string[];
	goals: string[];
	suggestedReplies: string[];
	unlocked: boolean;
	done: boolean;
	/** Unlocked but not finished — at most the first such scene, so exactly one is "current". */
	current: boolean;
}

/**
 * The scene graph as a flat, ordered timeline. Authored order is the timeline order: the format
 * has no explicit chapter numbering, and `next`/`entryConditions` can fan out, so anything
 * cleverer would be invented structure rather than reported structure.
 */
export function sceneProgress(bundle: StoryBundle, state: EngineState): SceneProgress[] {
	let currentTaken = false;
	return bundle.graph.nodes.map((node, i) => {
		const done = state.completedSceneIds.has(node.id);
		const unlocked = state.unlockedSceneIds.has(node.id);
		const current = !done && unlocked && !currentTaken;
		if (current) currentTaken = true;
		return {
			id: node.id,
			index: i + 1,
			type: node.type,
			participantIds: [...node.participants],
			goals: [...node.goals],
			suggestedReplies: [...node.suggestedReplies],
			unlocked,
			done,
			current
		};
	});
}

export interface AchievementDisplay {
	id: string;
	label: string;
	description?: string;
	earned: boolean;
}

/**
 * The package's declared achievements, all unearned.
 *
 * This is not a stub: `achievementSchema` is id/label/description only, so a package can *name*
 * an achievement but cannot say when it is earned (#32) — and achievement ids and outcome ids
 * are separate namespaces, so they cannot be matched up either. Reporting them all as open is
 * the only honest reading of the data, and it is strictly better than the old behaviour, which
 * evaluated conditions the app had invented on the story's behalf.
 */
export function achievementDisplays(bundle: StoryBundle): AchievementDisplay[] {
	return bundle.story.achievements.map((achievement) => ({
		id: achievement.id,
		label: achievement.label,
		description: achievement.description,
		earned: false
	}));
}

export interface ReachedOutcome {
	id: string;
	sceneId: string;
}

/**
 * Outcomes the engine has actually reached — the one end-of-story signal that comes from real
 * state rather than from an authored guess, and therefore what "solved" means now.
 */
export function reachedOutcomes(bundle: StoryBundle, state: EngineState): ReachedOutcome[] {
	const reached: ReachedOutcome[] = [];
	for (const node of bundle.graph.nodes) {
		// Only group scenes carry outcomes (docs/concept.md §5.7).
		if (node.type !== 'group-chat-scene') continue;
		for (const outcome of node.outcomes) {
			if (state.reachedOutcomeIds.has(outcome.id)) {
				reached.push({ id: outcome.id, sceneId: node.id });
			}
		}
	}
	return reached;
}

export type ThreadKind = 'solo' | 'group';

export interface StoryThread {
	/** Character id for a solo thread, scene id for a group thread — stable across reloads and
	 *  usable as the `?thread=` query value. */
	key: string;
	kind: ThreadKind;
	/** Characters the player is talking to (a solo thread has exactly one). */
	participantIds: string[];
	/** Scenes whose messages belong in this thread, in authored order. */
	sceneIds: string[];
	/** The scene driving prompts and progress right now — unlocked, not yet completed. */
	activeSceneId: string | null;
}

/**
 * Threads a messenger should show for the current state.
 *
 * A story has several scenes with the same person, but a chat app shows *one* conversation per
 * person — so solo scenes are folded per character, while every group scene is its own thread
 * (its membership is what makes it a distinct chat). Only unlocked scenes count, and a solo
 * thread additionally needs its character to be visible, so a contact never appears before the
 * story introduces them.
 */
export function storyThreads(
	bundle: StoryBundle,
	state: EngineState,
	visibleCharacterIds: readonly string[]
): StoryThread[] {
	const visible = new Set(visibleCharacterIds);
	const scenes = sceneProgress(bundle, state).filter((scene) => scene.unlocked);
	const solo = new Map<string, StoryThread>();
	const groups: StoryThread[] = [];

	for (const scene of scenes) {
		if (scene.participantIds.length === 1) {
			const characterId = scene.participantIds[0];
			if (!visible.has(characterId)) continue;
			const existing = solo.get(characterId);
			if (existing) {
				existing.sceneIds.push(scene.id);
				existing.activeSceneId ??= scene.done ? null : scene.id;
			} else {
				solo.set(characterId, {
					key: characterId,
					kind: 'solo',
					participantIds: [characterId],
					sceneIds: [scene.id],
					activeSceneId: scene.done ? null : scene.id
				});
			}
			continue;
		}
		groups.push({
			key: scene.id,
			kind: 'group',
			participantIds: scene.participantIds.filter((id) => visible.has(id)),
			sceneIds: [scene.id],
			activeSceneId: scene.done ? null : scene.id
		});
	}

	return [...groups, ...solo.values()];
}
