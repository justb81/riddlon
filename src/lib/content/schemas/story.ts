import { z } from 'zod';
import { castBindingSchema } from './castBinding.js';
import { delayedEventSchema } from './delayedEvent.js';
import { seedChatSchema } from './seedChat.js';
import { symbolicRefSchema, uuidV4Schema } from './common.js';

/**
 * docs/arc42 §8.1.6. `conditions` is an **array** with AND semantics, matching
 * `entryConditions`/`exitConditions` and evaluated by the same `engine/conditions.ts`
 * `evaluateAll()`: "every clue found" is the conjunction of one `clue-known:` per clue, which a
 * single condition string cannot express (#32). Optional, so a package may still declare an
 * achievement it never awards automatically — a walkthrough-only or purely decorative ending
 * stays valid.
 */
export const achievementSchema = z.object({
	id: uuidV4Schema,
	label: z.string().min(1),
	description: z.string().optional(),
	conditions: z.array(symbolicRefSchema).default([])
});

/** story/story.json (docs/arc42 §8.1.3, §8.1.6, §8.1.8) */
export const storySchema = z.object({
	castBindings: z.array(castBindingSchema),
	achievements: z.array(achievementSchema).default([]),
	delayedEvents: z.array(delayedEventSchema).default([]),
	/** Pre-generated thread history installed with the package (#30) — see `seedChat.ts`. */
	seedChats: z.array(seedChatSchema).default([]),
	// §8.2: manifest/story may optionally declare which player-profile fields it needs.
	// Shape is unspecified in the doc beyond the field name — passthrough only, not deep-validated.
	playerProfileDefaults: z.record(z.string(), z.unknown()).optional()
});

export type Story = z.infer<typeof storySchema>;
export type Achievement = z.infer<typeof achievementSchema>;
