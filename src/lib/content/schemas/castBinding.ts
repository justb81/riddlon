import { z } from 'zod';
import { symbolicRefSchema, uuidV4Schema } from './common.js';

/**
 * docs/arc42 §8.1.3 only names "hidden" plus an `unlockCondition`; a binary
 * hidden|visible machine is the minimal model that satisfies every example in the doc
 * and issue #6's acceptance criteria, so that's the interpretation used here.
 */
export const availabilitySchema = z.object({
	initialState: z.enum(['hidden', 'visible']).default('visible'),
	unlockCondition: symbolicRefSchema.optional()
});

/** docs/arc42 §1.3's "Unbekannt" opening beat — a name shown until `revealCondition` holds,
 *  layered on the binding since the real name lives on the story-independent CharacterIdentity
 *  (issue #31). Sibling to `availability`, not nested in it: gating a contact's existence and
 *  masking its name are different concerns — a binding can be `visible` and still masked. */
export const identityMaskSchema = z.object({
	maskedDisplayName: z.string().min(1),
	revealCondition: symbolicRefSchema
});

export type IdentityMask = z.infer<typeof identityMaskSchema>;

/** docs/arc42 §8.1.3 — per-story role overlay for a character. */
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
	// Keyed by the OTHER character's UUID (docs/arc42 §8.1.3 end), not an array.
	relationships: z.record(uuidV4Schema, z.string().min(1)).default({}),
	identityMask: identityMaskSchema.optional()
});

export type CastBinding = z.infer<typeof castBindingSchema>;
