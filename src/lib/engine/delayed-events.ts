import type { StoryBundle } from '$lib/content/index.js';
import { parseAction } from './actions.js';
import { evaluateCondition } from './conditions.js';
import { parseIsoDurationMs } from './duration.js';
import {
	applyEngineAction,
	buildEvaluationContext,
	type EngineEffect,
	type EngineState
} from './state.js';

/**
 * Approximate delayed events (docs/arc42 §8.1.6, #9). Deliberately NOT a timer/alarm —
 * an event is "armed" (a due-date is persisted) the moment its `condition` first holds, and
 * only ever checked opportunistically via `fireDueEvents` on app open/resume. No
 * setTimeout, no service-worker background sync.
 */

/** Arms every `delayedEvents[]` entry whose condition now holds and isn't already armed. */
export function armDueEvents(state: EngineState, bundle: StoryBundle, now: number): EngineEffect[] {
	const effects: EngineEffect[] = [];
	const armedEventIds = new Set(state.pendingDelayedEvents.map((pending) => pending.eventId));
	const ctx = buildEvaluationContext(state, bundle);

	for (const definition of bundle.story.delayedEvents) {
		if (armedEventIds.has(definition.id)) continue;
		if (!evaluateCondition(definition.condition, ctx)) continue;

		const delayMs = parseIsoDurationMs(definition.approxDelay);
		if (delayMs === undefined) continue; // malformed duration — already schema-validated upstream

		const dueAt = new Date(now + delayMs).toISOString();
		state.pendingDelayedEvents.push({ eventId: definition.id, dueAt, fired: false });
		effects.push({ type: 'delayed-event-armed', eventId: definition.id, dueAt });
	}

	return effects;
}

/**
 * Fires every armed event whose `dueAt` has elapsed and that hasn't fired yet — the
 * fire-once guarantee #9 requires. Applies the event's action directly to `state`.
 */
export function fireDueEvents(
	state: EngineState,
	bundle: StoryBundle,
	now: number
): EngineEffect[] {
	const effects: EngineEffect[] = [];

	for (const pending of state.pendingDelayedEvents) {
		if (pending.fired) continue;
		if (new Date(pending.dueAt).getTime() > now) continue;

		pending.fired = true;
		const definition = bundle.story.delayedEvents.find((event) => event.id === pending.eventId);
		const action = definition ? parseAction(definition.action) : undefined;
		if (action) effects.push(...applyEngineAction(state, action));
		effects.push({ type: 'delayed-event-fired', eventId: pending.eventId, action });
	}

	return effects;
}
