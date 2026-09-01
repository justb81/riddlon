import { z } from 'zod';
import { isoDurationSchema, uuidV4Schema } from './common.js';

/** Mirrors `story/types.ts`'s `SPEAKER_ME`, duplicated as a literal so the content layer keeps
 *  its one-way dependency: `story/` reads the schemas, never the other way round. */
export const SEED_CHAT_PLAYER_SPEAKER = 'me';

/**
 * Pre-generated chat history for a thread the story unlocks later (docs/arc42 §8.1.8, #30).
 *
 * Anchored on a **scene**, not on a character or a cast binding: a chat app shows one thread per
 * person, so `story/`'s threads are derived (`story/story-display.ts`'s `storyThreads` folds solo
 * scenes per character and gives every group scene its own thread) and the scene id is the only
 * authored handle that maps onto both kinds. Attaching the history to the scene whose unlock
 * introduces the contact is therefore also what makes it appear exactly then.
 *
 * `offset` is a duration *before* the playthrough started, not an absolute date — an authored
 * date would go stale between authoring and playing.
 */
export const seedChatMessageSchema = z.object({
	/** `me` for the player, otherwise a character UUID from this scene's participants. */
	from: z.union([z.literal(SEED_CHAT_PLAYER_SPEAKER), uuidV4Schema]),
	text: z.string().min(1),
	/** How long before the story started this was sent, e.g. "P2D" or "PT45M". */
	offset: isoDurationSchema
});

export const seedChatSchema = z.object({
	sceneRef: uuidV4Schema,
	messages: z.array(seedChatMessageSchema).min(1)
});

export type SeedChat = z.infer<typeof seedChatSchema>;
export type SeedChatMessage = z.infer<typeof seedChatMessageSchema>;
