import { z } from 'zod';
import { uuidV4Schema } from './common.js';

/** docs/arc42 §8.1.3 — story-independent character identity. */
export const characterIdentitySchema = z.object({
	id: uuidV4Schema,
	slug: z.string().min(1).optional(),
	displayName: z.string().min(1),
	avatar: z.string().optional(),
	voiceStyle: z.string().optional(),
	corePersonality: z.string().optional(),
	originPackage: uuidV4Schema,
	shareable: z.boolean().default(true)
});

export type CharacterIdentity = z.infer<typeof characterIdentitySchema>;
