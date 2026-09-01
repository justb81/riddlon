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
 *
 * The condition is checked twice: once to arm, and again when the event comes due (#33). Arming
 * alone used to commit the event, which made "follow up *unless* the player has since done X"
 * unexpressible — the nudge fired regardless.
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
 * Fires every armed event whose `dueAt` has elapsed, that hasn't fired yet, and whose
 * `condition` still holds — the fire-once guarantee #9 requires, plus #9's own second
 * requirement that the condition be true *at fire time* (#33).
 *
 * An event that comes due with a false condition follows its authored `onDueConditionFalse`:
 * `drop` marks it fired without applying the action, so it can never come back; `rearm` forgets
 * the pending entry, which lets `armDueEvents` arm it again — with a fresh delay counted from
 * the moment the condition holds once more, i.e. "remind them when they go idle again" rather
 * than "fire the instant they do".
 *
 * The context is rebuilt per event on purpose: one event's action can set a flag another
 * event's condition reads, and a stale context would judge that one against pre-fire state.
 */
export function fireDueEvents(
	state: EngineState,
	bundle: StoryBundle,
	now: number
): EngineEffect[] {
	const effects: EngineEffect[] = [];
	const rearmedEventIds = new Set<string>();

	for (const pending of state.pendingDelayedEvents) {
		if (pending.fired) continue;
		if (new Date(pending.dueAt).getTime() > now) continue;

		const definition = bundle.story.delayedEvents.find((event) => event.id === pending.eventId);
		if (
			definition &&
			!evaluateCondition(definition.condition, buildEvaluationContext(state, bundle))
		) {
			const rearmed = definition.onDueConditionFalse === 'rearm';
			if (rearmed) rearmedEventIds.add(pending.eventId);
			else pending.fired = true;
			effects.push({ type: 'delayed-event-cancelled', eventId: pending.eventId, rearmed });
			continue;
		}

		pending.fired = true;
		const action = definition ? parseAction(definition.action) : undefined;
		if (action) effects.push(...applyEngineAction(state, action));
		effects.push({ type: 'delayed-event-fired', eventId: pending.eventId, action });
	}

	if (rearmedEventIds.size > 0) {
		state.pendingDelayedEvents = state.pendingDelayedEvents.filter(
			(pending) => !rearmedEventIds.has(pending.eventId)
		);
	}

	return effects;
}
