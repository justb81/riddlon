import { z } from 'zod';
import { castBindingSchema } from './castBinding.js';
import { delayedEventSchema } from './delayedEvent.js';
import { uuidV4Schema } from './common.js';

/** Full achievement schema is an explicit open point in docs/arc42 §11 — kept minimal/provisional. */
export const achievementSchema = z.object({
	id: uuidV4Schema,
	label: z.string().min(1),
	description: z.string().optional()
});

/** story/story.json (docs/arc42 §8.1.3, §8.1.6) */
export const storySchema = z.object({
	castBindings: z.array(castBindingSchema),
	achievements: z.array(achievementSchema).default([]),
	delayedEvents: z.array(delayedEventSchema).default([]),
	// §8.2: manifest/story may optionally declare which player-profile fields it needs.
	// Shape is unspecified in the doc beyond the field name — passthrough only, not deep-validated.
	playerProfileDefaults: z.record(z.string(), z.unknown()).optional()
});

export type Story = z.infer<typeof storySchema>;
