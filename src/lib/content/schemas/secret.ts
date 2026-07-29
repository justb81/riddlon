import { z } from 'zod';
import { symbolicRefSchema, uuidV4Schema } from './common.js';

/**
 * docs/concept.md §5.5. A secret is knowledge one or more characters withhold until
 * `revealCondition` holds — evaluated by the same engine condition vocabulary as scene
 * entry/exit conditions (see `engine/conditions.ts`), so it's a plain symbolicRef here too.
 */
export const secretSchema = z.object({
	id: symbolicRefSchema,
	type: z.literal('secret'),
	label: z.string().min(1),
	heldBy: z.array(uuidV4Schema).default([]),
	revealCondition: symbolicRefSchema
});

export type Secret = z.infer<typeof secretSchema>;

export const secretsFileSchema = z.array(secretSchema);
