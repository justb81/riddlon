import { z } from 'zod';
import { symbolicRefSchema } from './common.js';

/**
 * docs/arc42 §8.1.5. Facts are immutable canon truths the LLM must never contradict —
 * unlike clues (schemas/clue.ts) they have no sources and can never conflict, so there's
 * nothing to track beyond the statement itself.
 */
export const factSchema = z.object({
	id: symbolicRefSchema,
	type: z.literal('fact'),
	statement: z.string().min(1)
});

export type Fact = z.infer<typeof factSchema>;

export const factsFileSchema = z.array(factSchema);
