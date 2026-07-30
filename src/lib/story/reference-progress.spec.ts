import { describe, expect, it } from 'vitest';
import { loadStoryBundle, type StoryBundle } from '$lib/content/index.js';
import { StoryEngine } from '$lib/engine/engine.js';
import {
	ACH_ALL_CLUES,
	ACH_CASE_SOLVED,
	ACH_NO_FALSE_ACCUSATION,
	CLUE_MAX_WHEREABOUTS,
	CLUE_TIME_WINDOW,
	FLAG_EVIDENCE_PRESENTED,
	FLAG_LUCY_BRIEFED,
	LUCY_ID,
	MAX_ID,
	SABINE_ID,
	SCENE_GROUP,
	buildReferencePackageFiles
} from './reference-package.js';
import {
	ACHIEVEMENT_DEFS,
	MILESTONE_DEFS,
	isAchievementEarned,
	isMilestoneDone,
	resolveClueDisplays
} from './reference-progress.js';

function findMilestone(id: string) {
	const def = MILESTONE_DEFS.find((m) => m.id === id);
	if (!def) throw new Error(`no milestone def "${id}"`);
	return def;
}

function findAchievement(id: string) {
	const def = ACHIEVEMENT_DEFS.find((a) => a.id === id);
	if (!def) throw new Error(`no achievement def "${id}"`);
	return def;
}

function makeEngine(): StoryEngine {
	const result = loadStoryBundle(buildReferencePackageFiles());
	if (!result.valid || !result.bundle) {
		throw new Error(`invalid reference package: ${JSON.stringify(result.errors)}`);
	}
	return new StoryEngine(result.bundle as StoryBundle);
}

describe('reference story milestone/achievement bridging', () => {
	it('m1 is done from story start', () => {
		const engine = makeEngine();
		expect(isMilestoneDone(findMilestone('m1'), engine.state, engine.bundle)).toBe(true);
	});

	it('m2/m3 (the time-window contradiction) need both distinct claims recorded', () => {
		const engine = makeEngine();
		const m2 = findMilestone('m2');
		expect(isMilestoneDone(m2, engine.state, engine.bundle)).toBe(false);

		engine.recordClueClaim(CLUE_TIME_WINDOW, MAX_ID, 'kurz vor eins');
		expect(isMilestoneDone(m2, engine.state, engine.bundle)).toBe(false);

		engine.recordClueClaim(CLUE_TIME_WINDOW, SABINE_ID, 'halb zwölf');
		expect(isMilestoneDone(m2, engine.state, engine.bundle)).toBe(true);
		expect(isMilestoneDone(findMilestone('m3'), engine.state, engine.bundle)).toBe(true);
	});

	it('m4 needs only Lucy relaying Hans, before Max states his own conflicting account', () => {
		const engine = makeEngine();
		const m4 = findMilestone('m4');
		expect(isMilestoneDone(m4, engine.state, engine.bundle)).toBe(false);

		engine.recordClueClaim(CLUE_MAX_WHEREABOUTS, LUCY_ID, 'an der Jacke, laut Hans');
		expect(isMilestoneDone(m4, engine.state, engine.bundle)).toBe(true);
	});

	it('drives the full case-solved playthrough end to end', () => {
		const engine = makeEngine();

		engine.recordClueClaim(CLUE_TIME_WINDOW, MAX_ID, 'kurz vor eins');
		engine.recordClueClaim(CLUE_TIME_WINDOW, SABINE_ID, 'halb zwölf');
		engine.recordClueClaim(CLUE_MAX_WHEREABOUTS, LUCY_ID, 'an der Jacke, laut Hans');

		const briefEffects = engine.setFlag(FLAG_LUCY_BRIEFED);
		expect(briefEffects.some((e) => e.type === 'scene-unlocked' && e.sceneId === SCENE_GROUP)).toBe(
			true
		);

		// Max's own (conflicting) account, revealed once the group scene's seed plays.
		engine.recordClueClaim(CLUE_MAX_WHEREABOUTS, MAX_ID, 'draußen');

		const solveEffects = engine.setFlag(FLAG_EVIDENCE_PRESENTED);
		expect(solveEffects.some((e) => e.type === 'outcome-reached')).toBe(true);

		expect(isMilestoneDone(findMilestone('m5'), engine.state, engine.bundle)).toBe(true);
		expect(isMilestoneDone(findMilestone('m6'), engine.state, engine.bundle)).toBe(true);

		expect(isAchievementEarned(findAchievement(ACH_CASE_SOLVED), engine.state, engine.bundle)).toBe(
			true
		);
		expect(isAchievementEarned(findAchievement(ACH_ALL_CLUES), engine.state, engine.bundle)).toBe(
			true
		);
		expect(
			isAchievementEarned(findAchievement(ACH_NO_FALSE_ACCUSATION), engine.state, engine.bundle)
		).toBe(true);
	});
});

describe('reference story clue-display bridging (#35)', () => {
	it('a clue with no recorded claims yet resolves to an empty source list', () => {
		const engine = makeEngine();
		const displays = resolveClueDisplays(engine.state, engine.bundle);
		expect(displays[CLUE_TIME_WINDOW]).toEqual({ clueLabel: 'Ungefähre Tatzeit', sources: [] });
	});

	it('both distinct claims on the time-window clue show up as separate, named sources', () => {
		const engine = makeEngine();
		engine.recordClueClaim(CLUE_TIME_WINDOW, MAX_ID, 'kurz vor eins');
		engine.recordClueClaim(CLUE_TIME_WINDOW, SABINE_ID, 'halb zwölf');

		const displays = resolveClueDisplays(engine.state, engine.bundle);
		expect(displays[CLUE_TIME_WINDOW]).toEqual({
			clueLabel: 'Ungefähre Tatzeit',
			sources: [
				{ characterId: MAX_ID, who: 'Max', value: 'kurz vor eins' },
				{ characterId: SABINE_ID, who: 'Sabine', value: 'halb zwölf' }
			]
		});
	});

	it('recording a claim through a different path updates the resolved display with no code change', () => {
		const engine = makeEngine();
		engine.recordClueClaim(CLUE_MAX_WHEREABOUTS, LUCY_ID, 'an der Jacke, laut Hans');
		expect(resolveClueDisplays(engine.state, engine.bundle)[CLUE_MAX_WHEREABOUTS].sources).toEqual([
			{ characterId: LUCY_ID, who: 'Lucy', value: 'an der Jacke, laut Hans' }
		]);

		engine.recordClueClaim(CLUE_MAX_WHEREABOUTS, MAX_ID, 'draußen');
		expect(resolveClueDisplays(engine.state, engine.bundle)[CLUE_MAX_WHEREABOUTS].sources).toEqual([
			{ characterId: LUCY_ID, who: 'Lucy', value: 'an der Jacke, laut Hans' },
			{ characterId: MAX_ID, who: 'Max', value: 'draußen' }
		]);
	});
});
