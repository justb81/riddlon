import { z } from 'zod';
import { symbolicRefSchema, uuidV4Schema } from './common.js';

/**
 * docs/concept.md §5.5. `id` is deliberately the symbolic-tag schema, not a UUID — the
 * doc's own example uses "clue:time-window", and clue ids are never cross-package
 * referenced entities the way character/scene ids are (see schemas/common.ts).
 */
export const clueSchema = z.object({
	id: symbolicRefSchema,
	type: z.literal('clue'),
	label: z.string().min(1),
	confirmedBy: z.array(uuidV4Schema).default([]),
	conflicting: z.boolean().default(false)
});

export type Clue = z.infer<typeof clueSchema>;

export const cluesFileSchema = z.array(clueSchema);
