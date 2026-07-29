import { z } from 'zod';
import { isoDurationSchema, symbolicRefSchema } from './common.js';

/**
 * docs/concept.md §5.6. These are NOT reliable timers — they're persisted due-dates
 * checked opportunistically on next app open/resume (no background-execution guarantee
 * in a purely local offline PWA); that reconciliation is a storage/engine concern, not
 * validated here.
 */
export const delayedEventSchema = z.object({
	id: symbolicRefSchema,
	trigger: z.enum(['time-based']),
	approxDelay: isoDurationSchema,
	condition: symbolicRefSchema,
	action: symbolicRefSchema
});

export type DelayedEvent = z.infer<typeof delayedEventSchema>;
