import { describe, expect, it } from 'vitest';
import type { StoryBundle } from '$lib/content/index.js';
import { createInitialState } from './state.js';
import { armDueEvents, fireDueEvents } from './delayed-events.js';

const PACKAGE_ID = '11111111-1111-4111-8111-111111111111';

/** The docs/arc42 §8.1.6 example: Lucy's ~2h delayed follow-up after the player reports. */
function makeTestBundle(): StoryBundle {
	return {
		manifest: {
			format: 'chatstory-package',
			formatVersion: '1.0.0',
			id: PACKAGE_ID,
			title: 'Delayed Event Test Story',
			version: '0.1.0',
			author: 'Test',
			language: 'de',
			entryStory: 'story/story.json',
			entryGraph: 'story/graph.json',
			characters: [],
			world: [],
			assetsBase: 'assets/',
			minPlayerVersion: '0.1.0',
			capabilities: [],
			tags: []
		},
		story: {
			castBindings: [],
			achievements: [],
			delayedEvents: [
				{
					id: 'event:lucy-followup',
					trigger: 'time-based',
					approxDelay: 'PT2H',
					condition: 'flag:report-to-lucy-done',
					action: 'unlock-scene:scene-lucy-suspicion',
					onDueConditionFalse: 'drop'
				}
			],
			seedChats: []
		},
		graph: { nodes: [] },
		clues: [],
		facts: [],
		secrets: []
	};
}

const HOUR = 60 * 60 * 1000;

describe('armDueEvents', () => {
	it('arms an event once its condition holds, with dueAt = now + approxDelay', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		const t0 = 1_700_000_000_000;

		expect(armDueEvents(state, bundle, t0)).toEqual([]);

		state.flags['flag:report-to-lucy-done'] = true;
		const effects = armDueEvents(state, bundle, t0);
		expect(effects).toEqual([
			{
				type: 'delayed-event-armed',
				eventId: 'event:lucy-followup',
				dueAt: new Date(t0 + 2 * HOUR).toISOString()
			}
		]);
	});

	it('does not re-arm an already-armed event', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		const t0 = 1_700_000_000_000;
		state.flags['flag:report-to-lucy-done'] = true;
		armDueEvents(state, bundle, t0);
		expect(armDueEvents(state, bundle, t0 + HOUR)).toEqual([]);
		expect(state.pendingDelayedEvents).toHaveLength(1);
	});
});

describe('fireDueEvents', () => {
	it('does not fire before the delay has elapsed', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		const t0 = 1_700_000_000_000;
		state.flags['flag:report-to-lucy-done'] = true;
		armDueEvents(state, bundle, t0);

		expect(fireDueEvents(state, bundle, t0 + HOUR)).toEqual([]);
		expect(state.pendingDelayedEvents[0].fired).toBe(false);
	});

	it('fires the action exactly once once the delay has elapsed, never again on later resumes', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		const t0 = 1_700_000_000_000;
		state.flags['flag:report-to-lucy-done'] = true;
		armDueEvents(state, bundle, t0);

		const effects = fireDueEvents(state, bundle, t0 + 2 * HOUR);
		expect(effects).toEqual([
			{ type: 'scene-unlocked', sceneId: 'scene-lucy-suspicion' },
			{
				type: 'delayed-event-fired',
				eventId: 'event:lucy-followup',
				action: { type: 'unlock-scene', sceneId: 'scene-lucy-suspicion' }
			}
		]);
		expect(state.unlockedSceneIds.has('scene-lucy-suspicion')).toBe(true);

		expect(fireDueEvents(state, bundle, t0 + 3 * HOUR)).toEqual([]);
		expect(fireDueEvents(state, bundle, t0 + 100 * HOUR)).toEqual([]);
	});
});

/**
 * #33: the condition is re-checked at fire time, which is what makes "nudge the player *unless*
 * they have replied since" expressible at all. The two `onDueConditionFalse` behaviours differ
 * observably and silently, so both are pinned here.
 */
describe('fireDueEvents — condition re-check', () => {
	/** A nudge that only makes sense while the player has not replied yet. */
	function withNudge(onDueConditionFalse: 'drop' | 'rearm'): ReturnType<typeof makeTestBundle> {
		const bundle = makeTestBundle();
		return {
			...bundle,
			story: {
				...bundle.story,
				delayedEvents: [
					{
						id: 'event:nudge',
						trigger: 'time-based',
						approxDelay: 'PT20M',
						condition: 'not:flag:player-replied',
						action: 'set-flag:flag:nudge-due',
						onDueConditionFalse
					}
				]
			}
		};
	}

	const t0 = 1_700_000_000_000;

	it('does not apply the action when the condition no longer holds at due time', () => {
		const bundle = withNudge('drop');
		const state = createInitialState(bundle);
		armDueEvents(state, bundle, t0);
		expect(state.pendingDelayedEvents).toHaveLength(1);

		state.flags['flag:player-replied'] = true;
		const effects = fireDueEvents(state, bundle, t0 + HOUR);

		expect(effects).toEqual([
			{ type: 'delayed-event-cancelled', eventId: 'event:nudge', rearmed: false }
		]);
		expect(state.flags['flag:nudge-due']).toBeUndefined();
	});

	it('drops a cancelled event for good — it cannot fire on a later resume', () => {
		const bundle = withNudge('drop');
		const state = createInitialState(bundle);
		armDueEvents(state, bundle, t0);
		state.flags['flag:player-replied'] = true;
		fireDueEvents(state, bundle, t0 + HOUR);

		// Even if the condition becomes true again, and even after re-arming is attempted.
		delete state.flags['flag:player-replied'];
		armDueEvents(state, bundle, t0 + 2 * HOUR);
		expect(fireDueEvents(state, bundle, t0 + 10 * HOUR)).toEqual([]);
		expect(state.flags['flag:nudge-due']).toBeUndefined();
	});

	it('re-arms a cancelled event with a fresh delay when the package asks for it', () => {
		const bundle = withNudge('rearm');
		const state = createInitialState(bundle);
		armDueEvents(state, bundle, t0);
		state.flags['flag:player-replied'] = true;

		expect(fireDueEvents(state, bundle, t0 + HOUR)).toEqual([
			{ type: 'delayed-event-cancelled', eventId: 'event:nudge', rearmed: true }
		]);
		// Forgotten, not fired: that is what lets `armDueEvents` arm it again.
		expect(state.pendingDelayedEvents).toEqual([]);

		delete state.flags['flag:player-replied'];
		const armed = armDueEvents(state, bundle, t0 + 2 * HOUR);
		expect(armed).toEqual([
			{
				type: 'delayed-event-armed',
				eventId: 'event:nudge',
				// The delay runs from the re-arm, not from the original arming.
				dueAt: new Date(t0 + 2 * HOUR + 20 * 60 * 1000).toISOString()
			}
		]);
		fireDueEvents(state, bundle, t0 + 3 * HOUR);
		expect(state.flags['flag:nudge-due']).toBe(true);
	});

	it('still fires an event whose condition is a latch, unchanged from #9', () => {
		const bundle = makeTestBundle();
		const state = createInitialState(bundle);
		state.flags['flag:report-to-lucy-done'] = true;
		armDueEvents(state, bundle, t0);

		const effects = fireDueEvents(state, bundle, t0 + 2 * HOUR);
		expect(effects.some((effect) => effect.type === 'delayed-event-fired')).toBe(true);
	});
});
