import { z } from 'zod';
import { symbolicRefSchema, uuidV4Schema } from './common.js';

const baseSceneFields = {
	id: uuidV4Schema,
	participants: z.array(uuidV4Schema),
	goals: z.array(z.string()).default([]),
	/** Whether this scene proactively sends an opening message once unlocked, or stays silent
	 *  until the player writes first. Defaults to `true` (today's behavior). */
	autoOpen: z.boolean().default(true),
	/** Player-facing chip labels for the composer's suggestion row — what the player might say,
	 *  as opposed to `goals`, which is what the character wants (#52). */
	suggestedReplies: z.array(z.string()).default([]),
	entryConditions: z.array(symbolicRefSchema).default([]),
	exitConditions: z.array(symbolicRefSchema).default([]),
	revealables: z.array(symbolicRefSchema).default([]),
	/** Restricts which `world/facts.json` / `world/secrets.json` entries this scene's characters
	 *  bring into the model prompt (#79) — a small model stays on-topic and rule-compliant with
	 *  fewer, more relevant statements. Optional: omitting either list falls back to today's
	 *  "everything the character's cast binding knows" behavior, so existing packages don't break. */
	relevantFactIds: z.array(symbolicRefSchema).optional(),
	relevantSecretIds: z.array(symbolicRefSchema).optional()
};

/** docs/concept.md §5.4 */
export const chatSceneSchema = z.object({
	...baseSceneFields,
	type: z.literal('chat-scene'),
	next: z
		.array(z.object({ target: uuidV4Schema, when: z.array(symbolicRefSchema).default([]) }))
		.default([])
});

/** docs/concept.md §5.7 — same base shape, but `playerRole` + `outcomes` replace `next`. */
export const groupChatSceneSchema = z.object({
	...baseSceneFields,
	type: z.literal('group-chat-scene'),
	playerRole: z.string().min(1),
	outcomes: z.array(z.object({ id: symbolicRefSchema, condition: symbolicRefSchema })).default([])
});

export const sceneNodeSchema = z.discriminatedUnion('type', [
	chatSceneSchema,
	groupChatSceneSchema
]);
export type SceneNode = z.infer<typeof sceneNodeSchema>;

/** story/graph.json's wrapper shape isn't given in docs/concept.md — designed as a flat node list. */
export const storyGraphSchema = z.object({ nodes: z.array(sceneNodeSchema) });
export type StoryGraph = z.infer<typeof storyGraphSchema>;
