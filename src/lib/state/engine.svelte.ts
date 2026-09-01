/**
 * The live `StoryEngine` runtime for installed stories. A singleton (like `llm.svelte.ts`) so
 * engines survive navigating between screens; `init()` is idempotent and safe to call from
 * every screen that needs engine data.
 *
 * Holds one `EngineSession` per installed package rather than a single fixed session — each
 * package gets its own `StoryEngine` + save, cached in `#sessions` once loaded, so switching
 * which story is active (`switchTo`) never cross-contaminates another package's progress. The
 * reactive fields below always mirror the *active* session.
 *
 * Nothing in here knows a package id, a character or a scene: every field is derived from
 * whatever is installed. The previous version was hardcoded to a built-in demo package, which
 * is what made the app claim "no story installed" while the library listed one — see
 * `active-package.ts` for the pointer that now survives a reload.
 */

import { browser } from '$app/environment';
import {
	resolveEffectiveCharacterState,
	type EffectiveCharacterState
} from '$lib/characters/index.js';
import { evaluateCondition } from '$lib/engine/conditions.js';
import { StoryEngine } from '$lib/engine/engine.js';
import { buildEvaluationContext } from '$lib/engine/state.js';
import { watchForResume } from '$lib/engine/resume.svelte.js';
import { saveRecordPatchFromState, stateFromSaveRecord } from '$lib/engine/persistence.js';
import type { EngineEffect, ProgressSummary } from '$lib/engine/index.js';
import type { StoryBundle } from '$lib/content/index.js';
import {
	characterLibrary,
	saveStore,
	storyRegistry,
	type InstalledPackageSummary
} from '$lib/storage/index.js';
import { buildSeedChatMessages } from '$lib/story/seed-chats.js';
import {
	achievementDisplays,
	reachedOutcomes,
	resolveClueDisplays,
	sceneProgress,
	storyThreads,
	type AchievementDisplay,
	type ClueDisplay,
	type ReachedOutcome,
	type SceneProgress,
	type StoryThread
} from '$lib/story/story-display.js';
import {
	activationCandidateIds,
	readActivePackageId,
	writeActivePackageId
} from './active-package.js';

interface EngineSession {
	packageId: string;
	bundle: StoryBundle;
	engine: StoryEngine;
	saveId: string;
	cast: EffectiveCharacterState[];
	/** When each scene was first seen as completed, for the story overview's timeline. */
	sceneTimes: Record<string, string>;
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
	 *  overview's library preview both read this one source. */
	installedPackages = $state<InstalledPackageSummary[]>([]);
	/** The *active* session's package, or `null` when nothing is installed. */
	packageId = $state<string | null>(null);
	saveId = $state<string | null>(null);
	title = $state<string | null>(null);
	progress = $state<ProgressSummary | null>(null);
	visibleCharacterIds = $state<string[]>([]);
	/** Characters whose `castBinding.identityMask` hasn't lifted yet (issue #31) — the ids
	 *  `displayNameFor` renders as `identityMask.maskedDisplayName` instead of the real name. */
	maskedCharacterIds = $state<string[]>([]);
	/** The active package's cast, identity merged with this story's binding only. */
	cast = $state<EffectiveCharacterState[]>([]);
	scenes = $state<SceneProgress[]>([]);
	/** When each completed scene was first observed as done, keyed by scene id. */
	sceneTimes = $state<Record<string, string>>({});
	threads = $state<StoryThread[]>([]);
	achievements = $state<AchievementDisplay[]>([]);
	outcomes = $state<ReachedOutcome[]>([]);
	clueDisplays = $state<Record<string, ClueDisplay>>({});
	lastEffects = $state<EngineEffect[]>([]);
	/**
	 * The active package's bundle — reactive, and deliberately not a getter over `#active`.
	 *
	 * A plain getter can never invalidate a `$derived` that reads it, and the failure mode is
	 * silent: a derived evaluated before activation short-circuits on `bundle == null`, registers
	 * no dependency at all, and then stays `undefined` forever even though `bundle` is long since
	 * there (that is what made `/dev/story`'s scene lookup find nothing). `$state.raw` because the
	 * bundle is immutable once loaded — a deep proxy would buy nothing and would hand out a
	 * different object identity than `#sync` passes to the pure derivations.
	 */
	bundle = $state.raw<StoryBundle | null>(null);

	#sessions = new Map<string, EngineSession>();
	#active: EngineSession | null = null;
	#initPromise: Promise<void> | null = null;
	#activationListeners = new Set<() => void>();

	/** Imperative callers only — not reactive, for the reason spelled out on `bundle` above. */
	get engine(): StoryEngine | null {
		return this.#active?.engine ?? null;
	}

	/** An outcome has been reached — the end-of-story signal, whether the ending is a win or a
	 *  setback (`tone`); `solvedWell` is the narrower "reached a success ending". */
	get solved(): boolean {
		return this.outcomes.length > 0;
	}

	get solvedWell(): boolean {
		return this.outcomes.some((outcome) => outcome.tone === 'success');
	}

	/** Authored classification from the manifest, shown on the library card and the case file. */
	get tags(): string[] {
		return this.bundle?.manifest.tags ?? [];
	}

	displayNameFor(characterId: string): string {
		const character = this.cast.find((c) => c.id === characterId);
		if (!character) return characterId;
		if (character.identityMask && this.maskedCharacterIds.includes(characterId)) {
			return character.identityMask.maskedDisplayName;
		}
		return character.displayName;
	}

	threadFor(key: string): StoryThread | undefined {
		return this.threads.find((thread) => thread.key === key);
	}

	sceneById(sceneId: string): SceneProgress | undefined {
		return this.scenes.find((scene) => scene.id === sceneId);
	}

	/** Evaluates a package's own symbolic ref against live state — used to decide whether a
	 *  character's secret may come out yet (docs/arc42 §8.1.5). */
	isConditionMet(ref: string): boolean {
		if (!this.#active) return false;
		const { engine, bundle } = this.#active;
		return evaluateCondition(ref, buildEvaluationContext(engine.state, bundle));
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

	/** Fires after every activation, including one that happens long after `init()` (an import
	 *  into an empty library, or `switchTo` from another screen). `story-session.svelte.ts`
	 *  listens here rather than being called directly, which would be an import cycle. */
	onActivate(listener: () => void): void {
		this.#activationListeners.add(listener);
	}

	/** Re-reads the registry after an install/uninstall. Cheap (one IDB `getAll`), so callers
	 *  don't have to reason about whether anything actually changed. */
	async refreshLibrary(): Promise<void> {
		this.installedPackages = await storyRegistry.list();
		// A first import into an empty library becomes playable immediately, instead of waiting
		// for the next boot to notice it.
		if (this.initialized && !this.#active) await this.#activateBest();
	}

	/** Switches the active session to a different installed package — loads it (and creates its
	 *  save) on first visit, then reuses the same live `StoryEngine` on every later switch, so
	 *  progress in one package is never lost or mixed into another's. */
	async switchTo(packageId: string): Promise<void> {
		await this.init();
		if (this.packageId === packageId) return;
		const session = await this.#loadSession(packageId);
		if (!session) return;
		this.#activate(session);
	}

	async #doInit(): Promise<void> {
		this.installedPackages = await storyRegistry.list();

		// Registered unconditionally: a session activated later must get resume handling too, and
		// the callback is a no-op while nothing is active.
		watchForResume(() => {
			if (this.#active) this.#sync(this.#active.engine.resume());
		});

		if (await this.#activateBest()) this.ready = true;
	}

	/**
	 * Activates the first installed package that actually yields a bundle. Walking a candidate
	 * list rather than trusting one id is what keeps a single unloadable record from leaving the
	 * runtime with no session at all while the library still shows the story.
	 */
	async #activateBest(): Promise<boolean> {
		const ids = activationCandidateIds(readActivePackageId(), this.installedPackages);
		for (const id of ids) {
			const session = await this.#loadSession(id);
			if (session) {
				this.#activate(session);
				return true;
			}
		}
		return false;
	}

	async #loadSession(packageId: string): Promise<EngineSession | null> {
		const cached = this.#sessions.get(packageId);
		if (cached) return cached;

		const bundle = await storyRegistry.getBundle(packageId);
		if (!bundle) return null;

		// A brand-new playthrough gets the package's authored thread history written into its save
		// right away (#30); an existing save already carries it.
		const save =
			(await saveStore.getForPackage(packageId)) ??
			(await saveStore.createForPackage(packageId, buildSeedChatMessages(bundle)));
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
			cast: await loadCast(bundle),
			sceneTimes: {}
		};
		this.#sessions.set(packageId, session);
		return session;
	}

	#activate(session: EngineSession): void {
		this.#active = session;
		this.packageId = session.packageId;
		this.saveId = session.saveId;
		this.title = session.bundle.manifest.title;
		this.bundle = session.bundle;
		this.cast = session.cast;
		// The single choke point for "which story is active", so `switchTo` and the boot fallback
		// both persist the choice without having to remember to.
		writeActivePackageId(session.packageId);
		this.#sync(session.engine.resume());
		for (const listener of this.#activationListeners) listener();
	}

	setFlag(flag: string): EngineEffect[] {
		return this.#mutate((engine) => engine.setFlag(flag));
	}

	recordClueClaim(clueId: string, characterId: string, value: string): EngineEffect[] {
		return this.#mutate((engine) => engine.recordClueClaim(clueId, characterId, value));
	}

	/** Closes a contradiction the story has settled, so the "n Widerspruch offen" counter can
	 *  actually go down again. */
	resolveClue(clueId: string): EngineEffect[] {
		return this.#mutate((engine) => engine.resolveClue(clueId));
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

		this.lastEffects = effects;
		this.progress = session.engine.progress();
		this.visibleCharacterIds = [...session.engine.visibleCharacterIds()];
		this.maskedCharacterIds = [...session.engine.maskedCharacterIds()];
		this.scenes = sceneProgress(bundle, state);
		for (const scene of this.scenes) {
			if (scene.done && !session.sceneTimes[scene.id]) session.sceneTimes[scene.id] = nowTime();
		}
		this.sceneTimes = { ...session.sceneTimes };
		this.threads = storyThreads(bundle, state, this.visibleCharacterIds);
		this.achievements = achievementDisplays(bundle, state);
		this.outcomes = reachedOutcomes(bundle, state);
		this.clueDisplays = resolveClueDisplays(state, bundle, (id) => this.displayNameFor(id));

		if (session.saveId) void saveStore.update(session.saveId, saveRecordPatchFromState(state));
	}
}

/**
 * Merges each cast binding with the character identity from the local library. Identity fields
 * come from the library, story-scoped fields from this package's binding only — cross-story
 * leakage is impossible by construction (see `characters/resolve.ts`).
 */
async function loadCast(bundle: StoryBundle): Promise<EffectiveCharacterState[]> {
	const cast: EffectiveCharacterState[] = [];
	for (const binding of bundle.story.castBindings) {
		const record = await characterLibrary.getById(binding.characterRef);
		if (!record) continue;
		cast.push(resolveEffectiveCharacterState(record, binding));
	}
	return cast;
}

export const storyRuntime = new StoryRuntime();
