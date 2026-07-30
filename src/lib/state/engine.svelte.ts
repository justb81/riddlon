/**
 * The live `StoryEngine` runtime for installed stories — the real replacement for
 * `game.svelte.ts`'s old scripted timers (#13-#15). A singleton (like `llm.svelte.ts`) so
 * engines survive navigating between screens; `init()` is idempotent and safe to call from
 * every screen that needs engine data.
 *
 * Holds one `EngineSession` per installed package (#37) rather than a single fixed session —
 * each package gets its own `StoryEngine` + save, cached in `#sessions` once loaded, so
 * switching which story is "active" (`switchTo`) never cross-contaminates another package's
 * progress. The reactive fields below always mirror the *active* session; screens that only
 * ever care about the reference story (the real chat content lives nowhere else yet — see
 * `game.svelte.ts`) call `switchTo(REFERENCE_PACKAGE_ID)` on mount to pin it back regardless
 * of what another screen last switched to.
 */

import { browser } from '$app/environment';
import { StoryEngine } from '$lib/engine/engine.js';
import { watchForResume } from '$lib/engine/resume.svelte.js';
import { saveRecordPatchFromState, stateFromSaveRecord } from '$lib/engine/persistence.js';
import type { EngineEffect, ProgressSummary } from '$lib/engine/index.js';
import type { StoryBundle } from '$lib/content/index.js';
import { saveStore, storyRegistry, type InstalledPackageSummary } from '$lib/storage/index.js';
import { ensureReferenceStoryInstalled } from '$lib/story/bootstrap.js';
import {
	OUTCOME_MAX_CONFESSES,
	PACKAGE_ID as REFERENCE_PACKAGE_ID
} from '$lib/story/reference-package.js';
import {
	ACHIEVEMENT_DEFS,
	MILESTONE_DEFS,
	isAchievementEarned,
	isMilestoneDone,
	resolveClueDisplays,
	type AchievementDef,
	type ClueDisplay,
	type MilestoneDef
} from '$lib/story/reference-progress.js';

export interface DisplayMilestone extends MilestoneDef {
	done: boolean;
	time: string;
}

interface EngineSession {
	packageId: string;
	bundle: StoryBundle;
	engine: StoryEngine;
	saveId: string;
	milestoneTimes: Record<string, string>;
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
	/** The *active* session's package, or `null` when nothing playable is installed (a fresh
	 *  device with the demo opted out, see `story/demo-story.ts`). */
	packageId = $state<string | null>(null);
	saveId = $state<string | null>(null);
	progress = $state<ProgressSummary | null>(null);
	visibleCharacterIds = $state<string[]>([]);
	/** Authored only for the reference story (#32 tracks giving the package format itself real
	 *  unlock conditions) — always empty for any other active package rather than showing that
	 *  story's milestones grafted onto content they don't apply to. */
	milestones = $state<DisplayMilestone[]>([]);
	earnedAchievements = $state<AchievementDef[]>([]);
	clueDisplays = $state<Record<string, ClueDisplay>>({});
	solved = $state(false);
	lastEffects = $state<EngineEffect[]>([]);

	#sessions = new Map<string, EngineSession>();
	#active: EngineSession | null = null;
	#initPromise: Promise<void> | null = null;

	get engine(): StoryEngine | null {
		return this.#active?.engine ?? null;
	}

	get bundle(): StoryBundle | null {
		return this.#active?.bundle ?? null;
	}

	/** Idempotent — safe to call from every screen that needs engine data. Loads the reference
	 *  story (installing it on a first-ever run) as the initial active session. */
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

	/** Switches the active session to a different installed package (#37) — loads it (and
	 *  creates its save) on first visit, then reuses the same live `StoryEngine` on every later
	 *  switch, so progress in one package is never lost or mixed into another's. A no-op if
	 *  that package is already active. */
	async switchTo(packageId: string): Promise<void> {
		await this.init();
		if (this.packageId === packageId) return;
		const session = await this.#loadSession(packageId);
		if (!session) return;
		this.#activate(session);
	}

	async #doInit(): Promise<void> {
		const summary = await ensureReferenceStoryInstalled();
		await this.refreshLibrary();
		if (!summary) {
			// Nothing playable installed — `ready` stays false and every screen falls back to its
			// empty state instead of rendering a story that isn't there.
			return;
		}

		const session = await this.#loadSession(summary.id);
		if (!session) return;
		this.#activate(session);

		watchForResume(() => {
			if (this.#active) this.#sync(this.#active.engine.resume());
		});

		this.ready = true;
	}

	async #loadSession(packageId: string): Promise<EngineSession | null> {
		const cached = this.#sessions.get(packageId);
		if (cached) return cached;

		const bundle = await storyRegistry.getBundle(packageId);
		if (!bundle) return null;

		const save =
			(await saveStore.getForPackage(packageId)) ?? (await saveStore.createForPackage(packageId));
		if (!save) return null;

		const hasSavedProgress = save.unlockedSceneIds.length > 0 || Object.keys(save.flags).length > 0;
		const engine = new StoryEngine(bundle, {
			state: hasSavedProgress ? stateFromSaveRecord(save) : undefined
		});

		const session: EngineSession = {
			packageId,
			bundle,
			engine,
			saveId: save.id,
			milestoneTimes: {}
		};
		this.#sessions.set(packageId, session);
		return session;
	}

	#activate(session: EngineSession): void {
		this.#active = session;
		this.packageId = session.packageId;
		this.saveId = session.saveId;
		this.#sync(session.engine.resume());
	}

	setFlag(flag: string): EngineEffect[] {
		return this.#mutate((engine) => engine.setFlag(flag));
	}

	recordClueClaim(clueId: string, characterId: string, value: string): EngineEffect[] {
		return this.#mutate((engine) => engine.recordClueClaim(clueId, characterId, value));
	}

	#mutate(fn: (engine: StoryEngine) => EngineEffect[]): EngineEffect[] {
		if (!this.#active) return [];
		const effects = fn(this.#active.engine);
		this.#sync(effects);
		return effects;
	}

	#sync(effects: EngineEffect[]): void {
		if (!this.#active) return;
		const session = this.#active;
		const { state } = session.engine;
		const { bundle } = session;
		const isReferenceStory = session.packageId === REFERENCE_PACKAGE_ID;

		this.lastEffects = effects;
		this.progress = session.engine.progress();
		this.visibleCharacterIds = [...session.engine.visibleCharacterIds()];

		if (isReferenceStory) {
			this.milestones = MILESTONE_DEFS.map((def) => {
				const done = isMilestoneDone(def, state, bundle);
				if (done && !session.milestoneTimes[def.id]) session.milestoneTimes[def.id] = nowTime();
				return { ...def, done, time: session.milestoneTimes[def.id] ?? '—' };
			});
			this.earnedAchievements = ACHIEVEMENT_DEFS.filter((def) =>
				isAchievementEarned(def, state, bundle)
			);
			this.solved = state.reachedOutcomeIds.has(OUTCOME_MAX_CONFESSES);
		} else {
			this.milestones = [];
			this.earnedAchievements = [];
			this.solved = false;
		}
		this.clueDisplays = resolveClueDisplays(state, bundle);

		if (session.saveId) void saveStore.update(session.saveId, saveRecordPatchFromState(state));
	}
}

export const storyRuntime = new StoryRuntime();
