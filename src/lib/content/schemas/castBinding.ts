import { z } from 'zod';
import { symbolicRefSchema, uuidV4Schema } from './common.js';

/**
 * docs/concept.md §5.3 only names "hidden" plus an `unlockCondition`; a binary
 * hidden|visible machine is the minimal model that satisfies every example in the doc
 * and issue #6's acceptance criteria, so that's the interpretation used here.
 */
export const availabilitySchema = z.object({
	initialState: z.enum(['hidden', 'visible']).default('visible'),
	unlockCondition: symbolicRefSchema.optional()
});

/** docs/concept.md §5.3 — per-story role overlay for a character. */
export const castBindingSchema = z.object({
	characterRef: uuidV4Schema,
	roleInStory: z.string().min(1),
	knowledge: z
		.object({
			publicFacts: z.array(symbolicRefSchema).default([]),
			secrets: z.array(symbolicRefSchema).default([])
		})
		.default({ publicFacts: [], secrets: [] }),
	availability: availabilitySchema.default({ initialState: 'visible' }),
	// Keyed by the OTHER character's UUID (docs/concept.md §5.3 end), not an array.
	relationships: z.record(uuidV4Schema, z.string().min(1)).default({})
});

export type CastBinding = z.infer<typeof castBindingSchema>;
