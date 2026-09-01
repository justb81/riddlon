import { describe, expect, it } from 'vitest';
import type { StoryBundle } from '$lib/content/index.js';
import { loadStoryBundle, validatePackage } from '$lib/content/index.js';
import {
	buildWalkthroughPackageFiles,
	LUCY_ID as WALKTHROUGH_LUCY_ID,
	MAX_ID as WALKTHROUGH_MAX_ID,
	SABINE_ID as WALKTHROUGH_SABINE_ID,
	SCENE_GROUP_CONFRONTATION,
	SCENE_LUCY_INTRO,
	SCENE_LUCY_SUSPICION,
	SCENE_MAX_QUESTIONING_1,
	SCENE_MAX_QUESTIONING_2,
	SCENE_REPORT_1,
	SCENE_REPORT_2,
	SCENE_SABINE_QUESTIONING_1,
	SCENE_SABINE_QUESTIONING_2,
	SCENE_UNKNOWN_CONTACT
} from '$lib/content/__fixtures__/lucys-portmonnaie-walkthrough.js';
import { isClueConflicting } from './clues.js';
import { StoryEngine } from './engine.js';
import { saveRecordPatchFromState, stateFromSaveRecord } from './persistence.js';

const PACKAGE_ID = '11111111-1111-4111-8111-111111111111';
const MAX_ID = '33333333-3333-4333-8333-333333333333';
const SCENE_A = '44444444-4444-4444-8444-444444444444';

function makeTestBundle(): StoryBundle {
	return {
		manifest: {
			format: 'chatstory-package',
			formatVersion: '1.0.0',
			id: PACKAGE_ID,
			title: 'Engine Facade Test Story',
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
			castBindings: [
				{
					characterRef: MAX_ID,
					roleInStory: 'witness',
					knowledge: { publicFacts: [], secrets: [] },
					availability: { initialState: 'hidden', unlockCondition: 'flag:max-unlocked' },
					relationships: {}
				}
			],
			achievements: [],
			delayedEvents: [
				{
					id: 'event:followup',
					trigger: 'time-based',
					approxDelay: 'PT1H',
					condition: 'flag:max-unlocked',
					action: 'unlock-scene:scene-followup',
					onDueConditionFalse: 'drop'
				}
			],
			seedChats: []
		},
		graph: {
			nodes: [
				{
					id: SCENE_A,
					type: 'chat-scene',
					participants: [MAX_ID],
					goals: [],
					suggestedReplies: [],
					autoOpen: true,
					entryConditions: ['flag:max-unlocked'],
					exitConditions: [],
					revealables: [],
					next: []
				}
			]
		},
		clues: [
			{
				id: 'clue:time-window',
				type: 'clue',
				label: 'Tatzeit',
				confirmedBy: [],
				conflicting: false
			}
		],
		facts: [],
		secrets: []
	};
}

describe('StoryEngine', () => {
	it('has no dependency on the current wall clock unless asked — an injected clock is honored', () => {
		const bundle = makeTestBundle();
		let fakeNow = 1_000;
		const engine = new StoryEngine(bundle, { clock: () => fakeNow });
		engine.setFlag('flag:max-unlocked');
		fakeNow = 1_000 + 60 * 60 * 1000;
		const effects = engine.resume();
		expect(effects).toContainEqual({ type: 'scene-unlocked', sceneId: 'scene-followup' });
	});

	it('setFlag unlocks a scene and character gated on that flag in one call', () => {
		const engine = new StoryEngine(makeTestBundle(), { clock: () => 0 });
		expect(engine.isCharacterVisible(MAX_ID)).toBe(false);
		const effects = engine.setFlag('flag:max-unlocked');
		expect(effects).toContainEqual({ type: 'flag-set', flag: 'flag:max-unlocked' });
		expect(effects).toContainEqual({ type: 'scene-unlocked', sceneId: SCENE_A });
		expect(engine.isCharacterVisible(MAX_ID)).toBe(true);
	});

	it('recordClueClaim + resolveClue round-trip through the facade', () => {
		const engine = new StoryEngine(makeTestBundle(), { clock: () => 0 });
		engine.recordClueClaim('clue:time-window', 'max', '22 Uhr');
		const conflictEffects = engine.recordClueClaim('clue:time-window', 'sabine', 'Mitternacht');
		expect(conflictEffects).toContainEqual({
			type: 'clue-conflict-detected',
			clueId: 'clue:time-window'
		});

		const resolveEffects = engine.resolveClue('clue:time-window');
		expect(resolveEffects).toContainEqual({ type: 'clue-resolved', clueId: 'clue:time-window' });
	});

	it('applyAction lets a caller fire an action directly, e.g. unlock-character', () => {
		const engine = new StoryEngine(makeTestBundle(), { clock: () => 0 });
		expect(engine.visibleCharacterIds().has(MAX_ID)).toBe(false);
		engine.applyAction({ type: 'unlock-character', characterId: MAX_ID });
		expect(engine.visibleCharacterIds().has(MAX_ID)).toBe(true);
	});

	it('progress() reflects real scene state', () => {
		const engine = new StoryEngine(makeTestBundle(), { clock: () => 0 });
		expect(engine.progress().totalSceneCount).toBe(1);
		expect(engine.progress().unlockedSceneIds).toEqual([]);
		engine.setFlag('flag:max-unlocked');
		expect(engine.progress().unlockedSceneIds).toEqual([SCENE_A]);
	});

	it('can resume from previously-persisted state without losing progress', () => {
		const engine = new StoryEngine(makeTestBundle(), { clock: () => 0 });
		engine.setFlag('flag:max-unlocked');
		const resumed = new StoryEngine(makeTestBundle(), { state: engine.state, clock: () => 0 });
		expect(resumed.progress().unlockedSceneIds).toEqual([SCENE_A]);
	});
});

const HOUR_MS = 60 * 60 * 1000;

function makeWalkthroughEngine(clock: () => number): StoryEngine {
	const result = loadStoryBundle(buildWalkthroughPackageFiles());
	if (!result.valid || !result.bundle) {
		throw new Error(`walkthrough fixture failed to validate: ${JSON.stringify(result.errors)}`);
	}
	return new StoryEngine(result.bundle, { clock });
}

describe('walkthrough: docs/arc42 §1.3 "Lucys Portmonnaie" end-to-end (#7, #8, #9)', () => {
	it('the shipped package validates against the package format with zero errors', () => {
		const result = validatePackage(buildWalkthroughPackageFiles());
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it('reproduces steps 1-15: contact unlocks, the evidence gate, the delayed event, group resolution', () => {
		let now = 1_700_000_000_000;
		const engine = makeWalkthroughEngine(() => now);

		// Steps 1-3: the cold-open scene is the only thing unlocked; Lucy is already a
		// contact (her display name still reading "Unbekannt" is a UI concern, not a graph
		// one), Max/Sabine are not. The ~20min "no reaction yet" nudge arms immediately.
		expect(engine.progress().unlockedSceneIds).toEqual([SCENE_UNKNOWN_CONTACT]);
		expect(engine.isCharacterVisible(WALKTHROUGH_LUCY_ID)).toBe(true);
		expect(engine.isCharacterVisible(WALKTHROUGH_MAX_ID)).toBe(false);
		expect(engine.isCharacterVisible(WALKTHROUGH_SABINE_ID)).toBe(false);
		expect(engine.state.pendingDelayedEvents).toContainEqual({
			eventId: 'event:lucy-nudge',
			dueAt: new Date(now + 20 * 60 * 1000).toISOString(),
			fired: false
		});

		// Step 4: Lucy identifies herself and asks for help.
		engine.setFlag('flag:lucy-identified', now);
		expect(engine.progress().unlockedSceneIds).toContain(SCENE_LUCY_INTRO);

		// Step 5-6: Lucy names Max and Sabine — both appear as contacts, both questioning scenes unlock.
		engine.setFlag('flag:witnesses-named', now);
		expect(engine.isCharacterVisible(WALKTHROUGH_MAX_ID)).toBe(true);
		expect(engine.isCharacterVisible(WALKTHROUGH_SABINE_ID)).toBe(true);
		expect(engine.progress().unlockedSceneIds).toEqual(
			expect.arrayContaining([SCENE_MAX_QUESTIONING_1, SCENE_SABINE_QUESTIONING_1])
		);

		// Step 7: contradicting accounts of the time of the theft — both sources persist.
		engine.recordClueClaim('clue:time-window', WALKTHROUGH_MAX_ID, 'gegen 22 Uhr', now);
		engine.setFlag('flag:max-questioned', now);
		// Only ONE source confirmed so far — the report scene's evidence gate stays locked.
		expect(engine.progress().unlockedSceneIds).not.toContain(SCENE_REPORT_1);

		const conflictEffects = engine.recordClueClaim(
			'clue:time-window',
			WALKTHROUGH_SABINE_ID,
			'gegen Mitternacht',
			now
		);
		expect(conflictEffects).toContainEqual({
			type: 'clue-conflict-detected',
			clueId: 'clue:time-window'
		});
		expect(isClueConflicting(engine.state, 'clue:time-window')).toBe(true);

		// Now both witnesses questioned AND both sources confirmed — the evidence gate opens.
		engine.setFlag('flag:sabine-questioned', now);
		expect(engine.progress().unlockedSceneIds).toContain(SCENE_REPORT_1);

		// Step 8: player reports to Lucy — the ~2h delayed event arms but hasn't fired.
		engine.setFlag('flag:report-to-lucy-done', now);
		expect(engine.state.pendingDelayedEvents).toContainEqual({
			eventId: 'event:lucy-followup',
			dueAt: new Date(now + 2 * HOUR_MS).toISOString(),
			fired: false
		});
		expect(engine.progress().unlockedSceneIds).not.toContain(SCENE_LUCY_SUSPICION);

		// Reopening BEFORE the delay has elapsed does not fire the followup. (The unrelated
		// step-2 nudge is long overdue by now and does fire here — hence the per-event check.)
		now += HOUR_MS;
		const earlyEffects = engine.resume(now);
		expect(
			earlyEffects.some(
				(e) => e.type === 'delayed-event-fired' && e.eventId === 'event:lucy-followup'
			)
		).toBe(false);
		expect(engine.progress().unlockedSceneIds).not.toContain(SCENE_LUCY_SUSPICION);

		// Step 9: after ~2h total, the delayed event fires exactly once.
		now += HOUR_MS;
		const firedEffects = engine.resume(now);
		expect(firedEffects).toContainEqual({
			type: 'delayed-event-fired',
			eventId: 'event:lucy-followup',
			action: { type: 'unlock-scene', sceneId: SCENE_LUCY_SUSPICION }
		});
		expect(engine.progress().unlockedSceneIds).toContain(SCENE_LUCY_SUSPICION);

		// It never fires again on later resumes.
		now += HOUR_MS;
		expect(engine.resume(now).some((e) => e.type === 'delayed-event-fired')).toBe(false);

		// Step 10: re-questioning — Max denies, Sabine confirms Hans's claim (2nd contradiction).
		engine.setFlag('flag:suspicion-relayed', now);
		expect(engine.progress().unlockedSceneIds).toEqual(
			expect.arrayContaining([SCENE_MAX_QUESTIONING_2, SCENE_SABINE_QUESTIONING_2])
		);
		engine.recordClueClaim(
			'clue:max-whereabouts',
			WALKTHROUGH_MAX_ID,
			'war nicht an der Garderobe',
			now
		);
		const secondConflict = engine.recordClueClaim(
			'clue:max-whereabouts',
			WALKTHROUGH_SABINE_ID,
			'war an der Garderobe',
			now
		);
		expect(secondConflict).toContainEqual({
			type: 'clue-conflict-detected',
			clueId: 'clue:max-whereabouts'
		});
		engine.setFlag('flag:max-denies-hans-claim', now);
		engine.setFlag('flag:sabine-confirms-hans-claim', now);
		expect(engine.progress().unlockedSceneIds).toContain(SCENE_REPORT_2);

		// Step 11-12: group chat opens ONLY once flag:hans-info-confirmed is set.
		expect(engine.progress().unlockedSceneIds).not.toContain(SCENE_GROUP_CONFRONTATION);
		engine.setFlag('flag:hans-info-confirmed', now);
		expect(engine.progress().unlockedSceneIds).toContain(SCENE_GROUP_CONFRONTATION);

		// Step 13-15: confronted with evidence, Max confesses — the outcome fires last.
		expect(engine.progress().reachedOutcomeIds).toEqual([]);
		const confessEffects = engine.setFlag('flag:evidence-presented', now);
		expect(confessEffects).toContainEqual({
			type: 'outcome-reached',
			sceneId: SCENE_GROUP_CONFRONTATION,
			outcomeId: 'max-confesses'
		});
		expect(engine.progress().reachedOutcomeIds).toEqual(['max-confesses']);
	});
});

/** #32's fire-once-across-reloads requirement, through the real save round-trip. */
describe('StoryEngine — earned achievements survive a reload', () => {
	const ACHIEVEMENT = '88888888-8888-4888-8888-888888888888';

	function withAchievement(): StoryBundle {
		const bundle = makeTestBundle();
		return {
			...bundle,
			story: {
				...bundle.story,
				achievements: [
					{ id: ACHIEVEMENT, label: 'Kontakt gefunden', conditions: ['flag:max-unlocked'] }
				]
			}
		};
	}

	it('awards once, then resumes from the save without re-emitting the effect', () => {
		const bundle = withAchievement();
		const engine = new StoryEngine(bundle, { clock: () => 0 });

		expect(engine.setFlag('flag:max-unlocked')).toContainEqual({
			type: 'achievement-earned',
			achievementId: ACHIEVEMENT
		});

		const patch = saveRecordPatchFromState(engine.state);
		expect(patch.earnedAchievementIds).toEqual([ACHIEVEMENT]);

		const resumed = new StoryEngine(bundle, {
			clock: () => 0,
			state: stateFromSaveRecord({
				id: 'save-1',
				packageId: bundle.manifest.id,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				chatHistory: [],
				...patch
			})
		});

		expect(resumed.state.earnedAchievementIds.has(ACHIEVEMENT)).toBe(true);
		expect(resumed.resume()).not.toContainEqual({
			type: 'achievement-earned',
			achievementId: ACHIEVEMENT
		});
	});
});
