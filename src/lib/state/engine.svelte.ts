/**
 * The live `StoryEngine` runtime for the currently-installed reference story — the real
 * replacement for `game.svelte.ts`'s old scripted timers (#13-#15). A singleton (like
 * `llm.svelte.ts`) so the engine survives navigating between screens; `init()` is
 * idempotent and safe to call from every screen that needs engine data.
 */

import { browser } from '$app/environment';
import { StoryEngine } from '$lib/engine/engine.js';
import { watchForResume } from '$lib/engine/resume.svelte.js';
import { saveRecordPatchFromState, stateFromSaveRecord } from '$lib/engine/persistence.js';
import type { EngineEffect, ProgressSummary } from '$lib/engine/index.js';
import type { StoryBundle } from '$lib/content/index.js';
import { saveStore, storyRegistry, type InstalledPackageSummary } from '$lib/storage/index.js';
import { ensureReferenceStoryInstalled } from '$lib/story/bootstrap.js';
import { OUTCOME_MAX_CONFESSES } from '$lib/story/reference-package.js';
import {
	ACHIEVEMENT_DEFS,
	MILESTONE_DEFS,
	isAchievementEarned,
	isMilestoneDone,
	type AchievementDef,
	type MilestoneDef
} from '$lib/story/reference-progress.js';

export interface DisplayMilestone extends MilestoneDef {
	done: boolean;
	time: string;
}

function nowTime(): string {
	const d = new Date();
	return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

class StoryRuntime {
	ready = $state(false);
	/** `init()` has finished, successfully or not — the difference between "still loading" and
	 *  "nothing installed", which is what lets screens hold off on their empty state instead of
	 *  flashing it on every cold start. */
	initialized = $state(false);
	/** Every package in the registry — the library list in `/chat/riddlon` and the chat
	 *  overview's "Deine Bibliothek: n Geschichten" both read this one source. */
	installedPackages = $state<InstalledPackageSummary[]>([]);
	/** The package the engine is actually running, or `null` when nothing playable is
	 *  installed (a fresh device with the demo opted out, see `story/demo-story.ts`). */
	packageId = $state<string | null>(null);
	saveId = $state<string | null>(null);
	progress = $state<ProgressSummary | null>(null);
	visibleCharacterIds = $state<string[]>([]);
	milestones = $state<DisplayMilestone[]>([]);
	earnedAchievements = $state<AchievementDef[]>([]);
	solved = $state(false);
	lastEffects = $state<EngineEffect[]>([]);

	#engine: StoryEngine | null = null;
	#bundle: StoryBundle | null = null;
	#milestoneTimes: Record<string, string> = {};
	#initPromise: Promise<void> | null = null;

	get engine(): StoryEngine | null {
		return this.#engine;
	}

	get bundle(): StoryBundle | null {
		return this.#bundle;
	}

	/** Idempotent — safe to call from every screen that needs engine data. */
	init(): Promise<void> {
		if (!browser) return Promise.resolve();
		if (!this.#initPromise) {
			this.#initPromise = this.#doInit().finally(() => {
				this.initialized = true;
			});
		}
		return this.#initPromise;
	}

	/** Re-reads the registry after an install/uninstall. Cheap (one IDB `getAll`), so callers
	 *  don't have to reason about whether anything actually changed. */
	async refreshLibrary(): Promise<void> {
		this.installedPackages = await storyRegistry.list();
	}

	async #doInit(): Promise<void> {
		const summary = await ensureReferenceStoryInstalled();
		await this.refreshLibrary();
		if (!summary) {
			// Nothing playable installed — `ready` stays false and every screen falls back to its
			// empty state instead of rendering a story that isn't there.
			return;
		}

		const bundle = await storyRegistry.getBundle(summary.id);
		if (!bundle) return;
		this.#bundle = bundle;
		this.packageId = summary.id;

		const save =
			(await saveStore.getForPackage(summary.id)) ?? (await saveStore.createForPackage(summary.id));
		if (!save) return;
		this.saveId = save.id;

		const hasSavedProgress = save.unlockedSceneIds.length > 0 || Object.keys(save.flags).length > 0;
		this.#engine = new StoryEngine(bundle, {
			state: hasSavedProgress ? stateFromSaveRecord(save) : undefined
		});
		this.#sync(this.#engine.resume());

		watchForResume(() => {
			if (this.#engine) this.#sync(this.#engine.resume());
		});

		this.ready = true;
	}

	setFlag(flag: string): EngineEffect[] {
		return this.#mutate((engine) => engine.setFlag(flag));
	}

	recordClueClaim(clueId: string, characterId: string, value: string): EngineEffect[] {
		return this.#mutate((engine) => engine.recordClueClaim(clueId, characterId, value));
	}

	#mutate(fn: (engine: StoryEngine) => EngineEffect[]): EngineEffect[] {
		if (!this.#engine) return [];
		const effects = fn(this.#engine);
		this.#sync(effects);
		return effects;
	}

	#sync(effects: EngineEffect[]): void {
		if (!this.#engine || !this.#bundle) return;
		const { state } = this.#engine;
		const bundle = this.#bundle;

		this.lastEffects = effects;
		this.progress = this.#engine.progress();
		this.visibleCharacterIds = [...this.#engine.visibleCharacterIds()];

		this.milestones = MILESTONE_DEFS.map((def) => {
			const done = isMilestoneDone(def, state, bundle);
			if (done && !this.#milestoneTimes[def.id]) this.#milestoneTimes[def.id] = nowTime();
			return { ...def, done, time: this.#milestoneTimes[def.id] ?? '—' };
		});
		this.earnedAchievements = ACHIEVEMENT_DEFS.filter((def) =>
			isAchievementEarned(def, state, bundle)
		);
		this.solved = state.reachedOutcomeIds.has(OUTCOME_MAX_CONFESSES);

		if (this.saveId) void saveStore.update(this.saveId, saveRecordPatchFromState(state));
	}
}

export const storyRuntime = new StoryRuntime();
