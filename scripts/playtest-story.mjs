#!/usr/bin/env node
/**
 * Replays a scripted walkthrough of a story package through the real engine
 * (`src/lib/engine/`) — no LLM, no browser. A walkthrough step stands in for whatever a real
 * conversation turn would have produced (a director verdict setting flags/clues) or for time
 * passing (a delayed event becoming due), so this exercises the exact production condition/
 * transition/delayed-event code `stories:validate` never touches (see stories/README.md "Playtesting") —
 * it catches an orphaned scene, a typo'd flag, or a delayed event that never fires, by
 * actually trying to walk the graph instead of guessing at it.
 *
 * Usage:
 *   node scripts/playtest-story.mjs stories/<slug> [path/to/walkthrough.json]
 *
 * `walkthrough.json` defaults to `<packageDir>/walkthrough.json` (authoring-only, like
 * `README.md` — not packed into the release zip). It's a JSON array of steps, applied in
 * order against a simulated clock that starts at 0 and only moves forward on `advance`:
 *
 *   [
 *     { "setFlag": "flag:lucy-identified" },
 *     { "claimClue": { "clueId": "clue:time-window", "characterId": "<uuid>", "value": "22 Uhr" } },
 *     { "resolveClue": "clue:time-window" },
 *     { "action": "unlock-character:<uuid>" },
 *     { "advance": "PT2H" },
 *     { "resume": true }
 *   ]
 *
 * Exits non-zero only on a malformed walkthrough or a package that fails `stories:validate`'s
 * own checks — an incomplete walkthrough (scenes/characters/outcomes never reached) is
 * reported but does not fail the run, since a scripted walkthrough legitimately covers one
 * path through a branching graph, not necessarily every branch.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readPackageFiles(packageDir) {
	const manifest = JSON.parse(await readFile(path.join(packageDir, 'manifest.json'), 'utf8'));
	const files = { 'manifest.json': manifest };
	for (const relative of [
		manifest.entryStory,
		manifest.entryGraph,
		...(manifest.characters ?? []),
		...(manifest.world ?? [])
	]) {
		files[relative] = JSON.parse(await readFile(path.join(packageDir, relative), 'utf8'));
	}
	return files;
}

function describeEffect(effect) {
	switch (effect.type) {
		case 'flag-set':
			return `flag set: ${effect.flag}`;
		case 'scene-unlocked':
			return `scene unlocked: ${effect.sceneId}`;
		case 'scene-completed':
			return `scene completed: ${effect.sceneId}`;
		case 'outcome-reached':
			return `outcome reached: ${effect.outcomeId} (${effect.sceneId})`;
		case 'character-unlocked':
			return `character unlocked: ${effect.characterId}`;
		case 'clue-recorded':
			return `clue recorded: ${effect.clueId} by ${effect.characterId} = "${effect.value}"`;
		case 'clue-conflict-detected':
			return `clue CONFLICT: ${effect.clueId}`;
		case 'clue-resolved':
			return `clue resolved: ${effect.clueId}`;
		case 'delayed-event-armed':
			return `delayed event armed: ${effect.eventId} (due ${effect.dueAt})`;
		case 'delayed-event-fired':
			return `delayed event FIRED: ${effect.eventId}${effect.action ? ` -> ${effect.action.type}` : ' (no action)'}`;
		case 'delayed-event-cancelled':
			return `delayed event cancelled (condition no longer held): ${effect.eventId}${effect.rearmed ? ' — re-armed' : ' — dropped'}`;
		case 'achievement-earned':
			return `achievement EARNED: ${effect.achievementId}`;
		default:
			return JSON.stringify(effect);
	}
}

async function main() {
	const packageArg = process.argv[2];
	if (!packageArg) {
		console.error('Usage: node scripts/playtest-story.mjs stories/<slug> [walkthrough.json]');
		process.exit(1);
	}
	const packageDir = path.resolve(ROOT, packageArg);
	const walkthroughPath = process.argv[3]
		? path.resolve(ROOT, process.argv[3])
		: path.join(packageDir, 'walkthrough.json');

	let steps;
	try {
		steps = JSON.parse(await readFile(walkthroughPath, 'utf8'));
	} catch (error) {
		console.error(`Could not read/parse walkthrough at ${walkthroughPath}: ${error.message}`);
		process.exit(1);
	}
	if (!Array.isArray(steps)) {
		console.error(`${walkthroughPath} must be a JSON array of steps`);
		process.exit(1);
	}

	// `configFile: false` skips the SvelteKit plugin — engine/content modules only use plain
	// relative imports at runtime (any `$lib` reference in them is a type-only import, erased
	// before this ever runs), so Vite's bare TS transform is all this needs (see build-stories.mjs).
	const vite = await createServer({
		configFile: false,
		logLevel: 'warn',
		appType: 'custom',
		server: { middlewareMode: true },
		optimizeDeps: { noDiscovery: true }
	});

	try {
		const { loadStoryBundle } = await vite.ssrLoadModule('/src/lib/content/load-package.ts');
		const { StoryEngine } = await vite.ssrLoadModule('/src/lib/engine/engine.ts');
		const { parseAction } = await vite.ssrLoadModule('/src/lib/engine/actions.ts');
		const { parseIsoDurationMs } = await vite.ssrLoadModule('/src/lib/engine/duration.ts');

		const files = await readPackageFiles(packageDir);
		const { valid, errors, bundle } = loadStoryBundle(files);
		if (!valid || !bundle) {
			console.error(`Package failed validation — fix this before playtesting:\n`);
			for (const error of errors) console.error(`  ${error.path}: ${error.message}`);
			process.exit(1);
		}

		let now = 0;
		const engine = new StoryEngine(bundle, { clock: () => now });
		console.log(`Playtesting "${bundle.manifest.title}" (${bundle.graph.nodes.length} scenes)\n`);
		console.log(`[t=0] engine started (zero-entryCondition scenes unlocked, due events armed)`);

		steps.forEach((step, index) => {
			let effects;
			let label;
			if ('setFlag' in step) {
				label = `setFlag(${step.setFlag})`;
				effects = engine.setFlag(step.setFlag, now);
			} else if ('claimClue' in step) {
				const { clueId, characterId, value } = step.claimClue;
				label = `claimClue(${clueId}, ${characterId}, "${value}")`;
				effects = engine.recordClueClaim(clueId, characterId, value, now);
			} else if ('resolveClue' in step) {
				label = `resolveClue(${step.resolveClue})`;
				effects = engine.resolveClue(step.resolveClue, now);
			} else if ('action' in step) {
				const action = parseAction(step.action);
				if (!action) throw new Error(`step ${index}: unrecognized action "${step.action}"`);
				label = `action(${step.action})`;
				effects = engine.applyAction(action, now);
			} else if ('advance' in step) {
				const ms = parseIsoDurationMs(step.advance);
				if (ms === undefined)
					throw new Error(`step ${index}: malformed duration "${step.advance}"`);
				now += ms;
				label = `advance(${step.advance}) -> t=${now}`;
				effects = engine.resume(now);
			} else if ('resume' in step) {
				label = `resume() at t=${now}`;
				effects = engine.resume(now);
			} else {
				throw new Error(`step ${index}: unrecognized step ${JSON.stringify(step)}`);
			}

			console.log(`\n[step ${index}] ${label}`);
			if (effects.length === 0) console.log('  (no effects)');
			for (const effect of effects) console.log(`  ${describeEffect(effect)}`);
		});

		const summary = engine.progress();
		const allSceneIds = bundle.graph.nodes.map((node) => node.id);
		const neverUnlocked = allSceneIds.filter((id) => !summary.unlockedSceneIds.includes(id));
		const neverCompleted = bundle.graph.nodes
			.filter((node) => node.exitConditions.length > 0)
			.map((node) => node.id)
			.filter(
				(id) => summary.unlockedSceneIds.includes(id) && !summary.completedSceneIds.includes(id)
			);
		const allCharacterIds = bundle.story.castBindings.map((binding) => binding.characterRef);
		const visibleCharacterIds = engine.visibleCharacterIds();
		const neverVisible = allCharacterIds.filter((id) => !visibleCharacterIds.has(id));
		const allOutcomeIds = bundle.graph.nodes.flatMap((node) =>
			(node.outcomes ?? []).map((o) => o.id)
		);
		const neverReached = allOutcomeIds.filter((id) => !summary.reachedOutcomeIds.includes(id));
		const awardableAchievements = bundle.story.achievements.filter(
			(achievement) => achievement.conditions.length > 0
		);
		const neverEarned = awardableAchievements
			.filter((achievement) => !engine.state.earnedAchievementIds.has(achievement.id))
			.map((achievement) => `${achievement.label} (${achievement.id})`);
		const neverFired = engine.state.pendingDelayedEvents
			.filter((pending) => !pending.fired)
			.map((pending) => pending.eventId);
		const neverArmed = bundle.story.delayedEvents
			.map((event) => event.id)
			.filter((id) => !engine.state.pendingDelayedEvents.some((pending) => pending.eventId === id));

		console.log(`\n--- coverage after ${steps.length} step(s), t=${now} ---`);
		console.log(
			`scenes:      ${summary.completedSceneCount}/${summary.totalSceneCount} completed, ${summary.unlockedSceneIds.length}/${summary.totalSceneCount} unlocked`
		);
		console.log(`characters:  ${visibleCharacterIds.size}/${allCharacterIds.length} visible`);
		console.log(`outcomes:    ${summary.reachedOutcomeIds.length}/${allOutcomeIds.length} reached`);
		console.log(
			`achievements: ${engine.state.earnedAchievementIds.size}/${awardableAchievements.length} earned (${bundle.story.achievements.length - awardableAchievements.length} declared without conditions)`
		);
		if (neverUnlocked.length > 0) console.log(`⚠ never unlocked:  ${neverUnlocked.join(', ')}`);
		if (neverCompleted.length > 0)
			console.log(`⚠ unlocked but never completed: ${neverCompleted.join(', ')}`);
		if (neverVisible.length > 0)
			console.log(`⚠ characters never visible: ${neverVisible.join(', ')}`);
		if (neverReached.length > 0)
			console.log(`⚠ outcomes never reached: ${neverReached.join(', ')}`);
		if (neverEarned.length > 0)
			console.log(`⚠ achievements never earned: ${neverEarned.join(', ')}`);
		if (neverArmed.length > 0)
			console.log(`⚠ delayed events never armed (condition never held): ${neverArmed.join(', ')}`);
		if (neverFired.length > 0)
			console.log(
				`⚠ delayed events armed but never fired (advance further to check): ${neverFired.join(', ')}`
			);
		if (
			neverUnlocked.length === 0 &&
			neverCompleted.length === 0 &&
			neverVisible.length === 0 &&
			neverReached.length === 0 &&
			neverEarned.length === 0 &&
			neverArmed.length === 0 &&
			neverFired.length === 0
		) {
			console.log(
				'✔ this walkthrough reaches every scene, character, outcome, achievement, and delayed event.'
			);
		}
	} finally {
		await vite.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
