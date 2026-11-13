import { z } from 'zod';
import { symbolicRefSchema, uuidV4Schema } from './common.js';

const baseSceneFields = {
	id: uuidV4Schema,
	participants: z.array(uuidV4Schema),
	goals: z.array(z.string()).default([]),
	/**
	 * Authored text per goal, keyed by its slug (docs/arc42 §8.1.4). Two texts because a goal is
	 * read twice: `intent` is what the character pursues, in its persona prompt; `reachedWhen` is
	 * what the director looks for in the transcript. Kept apart from `goals` rather than turning
	 * goals into objects, so slugs stay the identity everywhere (saves, the director's schema keys)
	 * and bundles installed before this field need no migration. Optional: a goal without an
	 * entry falls back to its slug.
	 */
	goalDetails: z
		.record(
			z.string(),
			z.object({
				intent: z.string().min(1).optional(),
				reachedWhen: z.string().min(1).optional()
			})
		)
		.optional(),
	/**
	 * When a flag the director may set counts as happened, keyed by its `flag:` ref
	 * (docs/arc42 §8.1.4): for `settableFlags`, for exit flags a goal-less scene asks directly, and
	 * for a group scene's outcome conditions. Optional, same fallback as `goalDetails`: the bare ref.
	 */
	flagDetails: z.record(z.string(), z.object({ reachedWhen: z.string().min(1) })).optional(),
	/** Whether this scene proactively sends an opening message once unlocked, or stays silent
	 *  until the player writes first. Defaults to `true` (today's behavior). */
	autoOpen: z.boolean().default(true),
	/** Player-facing chip labels for the composer's suggestion row — what the player might say,
	 *  as opposed to `goals`, which is what the character wants (#52). */
	suggestedReplies: z.array(z.string()).default([]),
	entryConditions: z.array(symbolicRefSchema).default([]),
	exitConditions: z.array(symbolicRefSchema).default([]),
	/** `flag:` refs the director may set in this scene **without** that completing it (#97) — an
	 *  accusation, a lie, a promise: a consequence a later beat can read while this one goes on.
	 *  Unlike `exitConditions`, nothing here is evaluated by the engine for scene completion. */
	settableFlags: z.array(symbolicRefSchema).default([]),
	revealables: z.array(symbolicRefSchema).default([]),
	/** Restricts which `world/facts.json` / `world/secrets.json` entries this scene's characters
	 *  bring into the model prompt (#79) — a small model stays on-topic and rule-compliant with
	 *  fewer, more relevant statements. Optional: omitting either list falls back to today's
	 *  "everything the character's cast binding knows" behavior, so existing packages don't break. */
	relevantFactIds: z.array(symbolicRefSchema).optional(),
	relevantSecretIds: z.array(symbolicRefSchema).optional()
};

/**
 * One authored ending of a group scene (docs/arc42 §8.1.7). `condition` is what the engine
 * evaluates; the rest is what the celebration screen shows instead of an authoring slug (#55).
 * `tone` exists because reaching an outcome is not automatically good news — a story that lets
 * the player accuse the wrong person needs that ending to read as a setback, not as confetti.
 */
export const sceneOutcomeSchema = z.object({
	id: symbolicRefSchema,
	condition: symbolicRefSchema,
	/** Player-facing name of this ending. Falls back to `id` in the UI when absent. */
	label: z.string().min(1).optional(),
	/** The closing paragraph for this ending — the one moment that deserves authored words. */
	closingText: z.string().min(1).optional(),
	tone: z.enum(['success', 'setback']).default('success')
});

export type SceneOutcome = z.infer<typeof sceneOutcomeSchema>;

/** docs/arc42 §8.1.4 */
export const chatSceneSchema = z.object({
	...baseSceneFields,
	type: z.literal('chat-scene'),
	next: z
		.array(z.object({ target: uuidV4Schema, when: z.array(symbolicRefSchema).default([]) }))
		.default([])
});

/** docs/arc42 §8.1.7 — same base shape, but `playerRole` + `outcomes` replace `next`. */
export const groupChatSceneSchema = z.object({
	...baseSceneFields,
	type: z.literal('group-chat-scene'),
	playerRole: z.string().min(1),
	outcomes: z.array(sceneOutcomeSchema).default([])
});

export const sceneNodeSchema = z.discriminatedUnion('type', [
	chatSceneSchema,
	groupChatSceneSchema
]);
export type SceneNode = z.infer<typeof sceneNodeSchema>;

/** story/graph.json's wrapper shape isn't given in docs/arc42 — designed as a flat node list. */
export const storyGraphSchema = z.object({ nodes: z.array(sceneNodeSchema) });
export type StoryGraph = z.infer<typeof storyGraphSchema>;
