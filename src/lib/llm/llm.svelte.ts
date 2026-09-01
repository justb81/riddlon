/**
 * The `llm` singleton the UI reads: load status, real download progress, which backend won, and which
 * models are already on the device.
 *
 * Same shape as the other app-wide stores (`$lib/state/*.svelte.ts`): a plain class with `$state`
 * fields, exported as one instance, every method inert outside the browser. The adapter is built
 * lazily inside it so nothing WebGPU-shaped is touched during prerender.
 *
 * There is no player preference to reconcile this against: which model runs is entirely the app's
 * decision (native Prompt API first, else `capabilities.ts`'s `bestSupportedModelId`), so this store
 * is the only source of truth — the settings screen's model list is a read-only view over it.
 */

import { browser } from '$app/environment';
import { createLlmAdapter } from './adapter.js';
import {
	canRunModel,
	detectLlmCapabilities,
	unsupportedModelReason,
	type LlmCapabilities
} from './capabilities.js';
import { shouldAutoStartDownload } from './capabilities-rules.js';
import { DEFAULT_MODEL_ID, MODEL_ORDER, type LocalModelId } from './catalog.js';
import { LlmError, classifyLoadError, type LlmErrorCode } from './errors.js';
import { hasEndpointConfig } from './endpoint-config.js';
import { isModelCached, markModelCached } from './model-cache.js';
import { resetProvider, resolveProvider } from './provider.js';
import type { LlmAdapter, LlmSession, LlmSessionConfig, LlmStatus, ProviderKind } from './types.js';

class LlmStore {
	status = $state<LlmStatus>('idle');
	/** 0..1, monotonic within a load. */
	progress = $state(0);
	errorCode = $state<LlmErrorCode | null>(null);
	backend = $state<ProviderKind | null>(null);
	/** The model currently loaded — not the one selected in settings. */
	activeModelId = $state<LocalModelId | null>(null);
	capabilities = $state<LlmCapabilities | null>(null);
	/** `undefined` for a model whose cache state hasn't been probed yet. */
	cached = $state<Partial<Record<LocalModelId, boolean>>>({});

	#adapter: LlmAdapter | undefined;
	#adapterModelId: LocalModelId | undefined;
	#loading: Promise<void> | undefined;

	/** True once a model is loaded and sessions can be created. */
	get ready(): boolean {
		return this.status === 'ready';
	}

	/** True when the app has to run without free-text replies (no WebGPU, or the load failed). */
	get degraded(): boolean {
		return this.status === 'error';
	}

	/**
	 * A device with neither a native Prompt API nor usable WebGPU still counts as `supported` once an
	 * OpenAI-compatible endpoint is configured — `#load` would otherwise fail it with `no-webgpu`
	 * before ever reaching `provider.ts`, which resolves that endpoint without asking the device
	 * anything.
	 */
	get supported(): boolean {
		const capabilities = this.capabilities;
		if (!capabilities) return true;
		return capabilities.hasNativeLanguageModel || capabilities.hasWebGpu || hasEndpointConfig();
	}

	/** Whether a first-run download may begin without asking (unmetered connection). */
	get mayAutoDownload(): boolean {
		return shouldAutoStartDownload(this.capabilities?.metered);
	}

	/** Same reasoning as `supported`, for the one catalog model rather than the device overall. */
	canRun(modelId: LocalModelId): boolean {
		const capabilities = this.capabilities;
		if (!capabilities) return true;
		if (canRunModel(capabilities, modelId)) return true;
		return hasEndpointConfig();
	}

	/**
	 * True once capabilities are known and neither native nor the default WebLLM model can run here
	 * — deliberately ignoring any configured endpoint, unlike `supported`/`canRun`. The settings
	 * screen uses this (not `supported`) to word its endpoint hint: "this device can't run a local
	 * model at all" has to stay true after saving an endpoint, or the explanation would vanish the
	 * moment it starts applying.
	 */
	get localUnusable(): boolean {
		const capabilities = this.capabilities;
		if (!capabilities) return false;
		return !capabilities.hasNativeLanguageModel && !canRunModel(capabilities, DEFAULT_MODEL_ID);
	}

	/** `undefined` when `modelId` can run here (or capabilities haven't been probed yet). */
	unsupportedReason(modelId: LocalModelId): LlmErrorCode | undefined {
		const capabilities = this.capabilities;
		return capabilities ? unsupportedModelReason(capabilities, modelId) : undefined;
	}

	/** The model currently downloading/preparing, for a per-row progress display. `null` when idle. */
	get loadingModelId(): LocalModelId | null {
		if (this.status !== 'downloading' && this.status !== 'preparing') return null;
		return this.#adapterModelId ?? null;
	}

	async detect(): Promise<void> {
		if (!browser) return;
		this.status = 'checking';
		this.capabilities = await detectLlmCapabilities();

		if (!this.supported) {
			this.#fail('no-webgpu');
			return;
		}
		this.status = 'idle';
	}

	/** Fills in `cached` for every catalog model, so the settings picker can stop guessing. */
	async refreshCacheState(): Promise<void> {
		if (!browser) return;
		const entries = await Promise.all(
			MODEL_ORDER.map(async (id) => [id, await isModelCached(id)] as const)
		);
		this.cached = Object.fromEntries(entries) as Partial<Record<LocalModelId, boolean>>;
	}

	async isModelCached(modelId: LocalModelId): Promise<boolean> {
		if (!browser) return false;
		const known = this.cached[modelId];
		if (known !== undefined) return known;
		const result = await isModelCached(modelId);
		this.cached = { ...this.cached, [modelId]: result };
		return result;
	}

	/**
	 * Whether loading `modelId` right now would find the model already on the device — as opposed to
	 * needing a real download. Backend-aware: whenever something other than WebLLM will win, it asks
	 * that backend's own `availability()` rather than `isModelCached`, which only ever probes the
	 * WebLLM cache and so can't see the other two at all. On a device that already has Gemini Nano,
	 * or one with an endpoint configured, `isModelCached` would say "not cached" and the boot screen
	 * would show an unearned first-run download bar for weights nobody is going to fetch.
	 */
	async isModelReady(modelId: LocalModelId): Promise<boolean> {
		if (!browser) return false;
		if (!this.capabilities) await this.detect();
		if (hasEndpointConfig() || this.capabilities?.hasNativeLanguageModel) {
			return (await this.#ensureAdapter(modelId).availability()) === 'ready';
		}
		return this.isModelCached(modelId);
	}

	/**
	 * Loads the requested model, reporting progress. Concurrent calls share one load rather than
	 * starting a second engine.
	 */
	async ensureLoaded(
		modelId: LocalModelId = DEFAULT_MODEL_ID,
		opts: { signal?: AbortSignal } = {}
	): Promise<void> {
		if (!browser) return;
		if (this.status === 'ready' && this.activeModelId === modelId) return;
		if (this.#loading && this.#adapterModelId === modelId) return this.#loading;

		const load = this.#load(modelId, opts);
		this.#loading = load;
		try {
			await load;
		} finally {
			if (this.#loading === load) this.#loading = undefined;
		}
	}

	async #load(modelId: LocalModelId, opts: { signal?: AbortSignal }): Promise<void> {
		if (!this.capabilities) await this.detect();
		if (!this.supported) {
			// Must go through #fail, not a bare throw: the splash reads `errorCode` to decide what to
			// say, and a retry has just cleared it.
			this.#fail('no-webgpu');
			throw new LlmError('no-webgpu');
		}

		if (!this.canRun(modelId)) {
			this.#fail('insufficient-vram');
			throw new LlmError('insufficient-vram');
		}

		const alreadyReady = await this.isModelReady(modelId);
		if (!alreadyReady && browser && navigator.onLine === false) {
			this.#fail('offline');
			throw new LlmError('offline');
		}

		this.status = 'downloading';
		this.progress = 0;
		this.errorCode = null;

		const adapter = this.#ensureAdapter(modelId);

		try {
			await adapter.load({
				signal: opts.signal,
				onProgress: ({ phase, fraction }) => {
					this.progress = Math.max(this.progress, fraction);
					this.status = phase === 'prepare' ? 'preparing' : 'downloading';
				}
			});
		} catch (error) {
			this.#fail(classifyLoadError(error));
			throw error;
		}

		this.backend = (await resolveProvider(modelId)).kind;
		this.activeModelId = modelId;
		this.progress = 1;
		this.status = 'ready';

		// Only a WebLLM load actually downloaded `modelId`'s weights — marking it cached under a
		// native or endpoint backend would make the (still unusable) catalog row look downloaded on
		// the next boot.
		if (this.backend === 'webllm') {
			this.cached = { ...this.cached, [modelId]: true };
			markModelCached(modelId);
		}
	}

	/**
	 * A conversation session for `key` (a thread id). Loads the model first if needed, so callers
	 * don't have to sequence it themselves.
	 */
	async session(
		key: string,
		config: LlmSessionConfig,
		modelId: LocalModelId = this.activeModelId ?? DEFAULT_MODEL_ID
	): Promise<LlmSession> {
		if (!browser) throw new LlmError('no-webgpu');
		await this.ensureLoaded(modelId);
		return this.#ensureAdapter(modelId).createSession(key, config);
	}

	/**
	 * Switches models: tears down the live engine so the next load picks up the new weights.
	 * `force` skips the no-op guard even when `modelId` is unchanged — needed after changing
	 * something that changes how the *same* model id resolves: saving or clearing an endpoint in
	 * settings, or `/dev/llm`'s force-WebLLM override. In both cases the live engine has to be
	 * rebuilt against a different backend, and `provider.ts`'s memo (keyed by model id alone)
	 * has to be dropped, which `resetProvider()` below does.
	 */
	async selectModel(modelId: LocalModelId, opts: { force?: boolean } = {}): Promise<void> {
		if (!browser) return;
		if (!opts.force && this.#adapterModelId === modelId && this.status === 'ready') return;

		await this.#adapter?.dispose();
		this.#adapter = undefined;
		this.#adapterModelId = undefined;
		resetProvider();

		this.status = 'idle';
		this.progress = 0;
		this.errorCode = null;
		this.activeModelId = null;
		this.backend = null;
	}

	/** Clears the error so the splash's retry button can start a fresh attempt. */
	reset(): void {
		this.status = 'idle';
		this.progress = 0;
		this.errorCode = null;
	}

	#ensureAdapter(modelId: LocalModelId): LlmAdapter {
		if (!this.#adapter || this.#adapterModelId !== modelId) {
			this.#adapter = createLlmAdapter({ modelId }, { resolveProvider });
			this.#adapterModelId = modelId;
		}
		return this.#adapter;
	}

	#fail(code: LlmErrorCode): void {
		this.errorCode = code;
		this.status = 'error';
	}
}

export const llm = new LlmStore();
