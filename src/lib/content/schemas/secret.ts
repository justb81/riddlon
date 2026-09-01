import { z } from 'zod';
import { symbolicRefSchema, uuidV4Schema } from './common.js';

/**
 * docs/arc42 §8.1.5. A secret is knowledge one or more characters withhold until
 * `revealCondition` holds — evaluated by the same engine condition vocabulary as scene
 * entry/exit conditions (see `engine/conditions.ts`), so it's a plain symbolicRef here too.
 */
export const secretSchema = z.object({
	id: symbolicRefSchema,
	type: z.literal('secret'),
	label: z.string().min(1),
	// A full sentence, unlike `label` — this is what reaches the model (persona-input.ts), and a
	// short label leaves it to invent who-did-what-to-whom, which is where a small model inverts it.
	statement: z.string().min(1),
	heldBy: z.array(uuidV4Schema).default([]),
	revealCondition: symbolicRefSchema
});

export type Secret = z.infer<typeof secretSchema>;

export const secretsFileSchema = z.array(secretSchema);
