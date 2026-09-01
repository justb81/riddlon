import { z } from 'zod';
import { isoDurationSchema, symbolicRefSchema } from './common.js';

/**
 * docs/arc42 §8.1.6. These are NOT reliable timers — they're persisted due-dates
 * checked opportunistically on next app open/resume (no background-execution guarantee
 * in a purely local offline PWA); that reconciliation is a storage/engine concern, not
 * validated here.
 */
export const delayedEventSchema = z.object({
	id: symbolicRefSchema,
	trigger: z.enum(['time-based']),
	approxDelay: isoDurationSchema,
	condition: symbolicRefSchema,
	action: symbolicRefSchema,
	/**
	 * What happens when the event comes due but its `condition` no longer holds (#33). `drop`
	 * abandons it for good — "nudge the player unless they have replied since"; `rearm` puts it
	 * back to pending so a later resume can still fire it — "remind them when they go idle
	 * again". Defaults to `drop`: an event that fires late and unconditionally is the behaviour
	 * #9 never asked for, and a silent re-arm is the more surprising of the two.
	 */
	onDueConditionFalse: z.enum(['drop', 'rearm']).default('drop')
});

export type DelayedEvent = z.infer<typeof delayedEventSchema>;
