/**
 * The adapter `engine/` and `ui/` talk to. Everything model- and backend-specific stops here.
 *
 * Every logical session — one per character, plus the director — gets its own real backend handle,
 * on both providers. That used to be true only for the native Prompt API: the WebLLM path went
 * through `prompt-api-polyfill`, whose backend rebuilt a whole `MLCEngine` on every `create()`, so
 * this file kept one shared handle and baked persona + history into prompt text instead
 * (`personaMode: 'inline'`) to avoid paying that reload per character. Issue #69 replaced that path
 * with `webllm-direct.ts`, whose one persistent engine makes a WebLLM `create()` just as cheap as a
 * native one — so the inline-baking special case is gone, and per-session isolation (no more
 * character bleed, no more the director inheriting a half-finished roleplay) now holds for both.
 *
 * Aborting mid-generation leaves the backend's conversation state undefined and neither
 * implementation documents a guarantee, so an interrupted handle is discarded and transparently
 * rebuilt from the turns we recorded ourselves. Because history lives here rather than only inside
 * the backend, a rebuild is lossless — and persisting it later (#5/#7 savegames) needs no interface
 * change.
 */

import { findModel, type LocalModelId } from './catalog.js';
import { LlmError, classifyLoadError } from './errors.js';
import { clampFraction, normalizeProgressEvent, phaseForFraction } from './progress.js';
import { readableToAsyncIterable, throwIfAborted, toDeltas } from './stream.js';
import { DEFAULT_MAX_HISTORY_TURNS, appendTurn, toInitialPrompts, windowTurns } from './turns.js';
import type {
	AdapterDeps,
	LanguageModelSessionLike,
	LlmAdapter,
	LlmAdapterConfig,
	LlmAvailability,
	LlmProgress,
	LlmSession,
	LlmSessionConfig,
	LlmTurn,
	ResolvedProvider
} from './types.js';

/** Key of the throwaway handle `load()` warms up just to trigger and report the download. */
const WARMUP_HANDLE = '__warmup__';

const DEFAULT_MAX_LIVE_SESSIONS = 4;

/** Everything a session needs from its adapter, so sessions themselves stay dumb. */
interface AdapterRuntime {
	prepareTurn(
		session: AdapterSession,
		text: string
	): Promise<{ input: string; backend: LanguageModelSessionLike }>;
	discardHandleFor(key: string): void;
	releaseSession(key: string): void;
}

class AdapterSession implements LlmSession {
	#turns: LlmTurn[];
	#config: LlmSessionConfig;

	constructor(
		readonly key: string,
		readonly modelId: LocalModelId,
		config: LlmSessionConfig,
		private readonly runtime: AdapterRuntime
	) {
		this.#config = config;
		this.#turns = [...(config.seedTurns ?? [])];
	}

	get config(): LlmSessionConfig {
		return this.#config;
	}

	get turns(): readonly LlmTurn[] {
		return this.#turns;
	}

	/**
	 * Adopts a new instruction for an ongoing conversation and reports whether anything actually
	 * changed. `seedTurns` is deliberately ignored — it seeded this session once; re-applying it
	 * would duplicate history the session has since extended.
	 *
	 * This exists because a thread's persona is not fixed: the same character keeps one session
	 * across a whole story while the *scene* driving their goals advances underneath. Without it a
	 * character forever replays the goals of the scene they were first spoken to in.
	 */
	reconfigure(next: LlmSessionConfig): boolean {
		const current = this.#config;
		const changed =
			current.systemPrompt !== next.systemPrompt ||
			current.temperature !== next.temperature ||
			current.topK !== next.topK ||
			current.maxHistoryTurns !== next.maxHistoryTurns;
		if (!changed) return false;
		this.#config = { ...next, seedTurns: current.seedTurns };
		return true;
	}

	async prompt(text: string, opts: { signal?: AbortSignal } = {}): Promise<string> {
		let answer = '';
		for await (const delta of this.stream(text, opts)) answer += delta;
		return answer;
	}

	async *stream(text: string, opts: { signal?: AbortSignal } = {}): AsyncIterable<string> {
		throwIfAborted(opts.signal);

		const { input, backend } = await this.runtime.prepareTurn(this, text);
		let produced = '';

		try {
			const raw = backend.promptStreaming(input, { signal: opts.signal });
			for await (const delta of toDeltas(readableToAsyncIterable(raw))) {
				produced += delta;
				yield delta;
			}
		} catch (error) {
			// The handle's conversation state is now unknowable — throw it away so the next turn
			// rebuilds from our own record instead of continuing from a half-finished answer.
			this.runtime.discardHandleFor(this.key);
			throw new LlmError(classifyLoadError(error), {
				cause: error,
				partial: produced || undefined
			});
		}

		this.record(text, produced);
	}

	async destroy(): Promise<void> {
		this.runtime.releaseSession(this.key);
	}

	/** History to replay when a handle has to be rebuilt, trimmed to this session's window. */
	historyForReplay(): readonly LlmTurn[] {
		return windowTurns(this.#turns, this.config.maxHistoryTurns ?? DEFAULT_MAX_HISTORY_TURNS);
	}

	record(userText: string, answer: string): void {
		this.#turns = appendTurn(appendTurn(this.#turns, 'user', userText), 'assistant', answer);
	}
}

export function createLlmAdapter(config: LlmAdapterConfig, deps: AdapterDeps): LlmAdapter {
	const modelId = config.modelId;

	let provider: ResolvedProvider | undefined;
	let maxLiveSessions = DEFAULT_MAX_LIVE_SESSIONS;
	/** Whether `load()` has already warmed up the engine once. */
	let warmedUp = false;

	/** Live backend handles, least-recently-used first. */
	const handles = new Map<string, LanguageModelSessionLike>();
	const sessions = new Map<string, AdapterSession>();

	async function ensureProvider(): Promise<ResolvedProvider> {
		if (!provider) {
			provider = await deps.resolveProvider(modelId);
			maxLiveSessions = config.maxLiveSessions ?? DEFAULT_MAX_LIVE_SESSIONS;
		}
		return provider;
	}

	async function createHandle(options: {
		key: string;
		systemPrompt: string;
		turns: readonly LlmTurn[];
		temperature?: number;
		topK?: number;
		signal?: AbortSignal;
		onProgress?: (progress: LlmProgress) => void;
	}): Promise<LanguageModelSessionLike> {
		const resolved = await ensureProvider();
		// -1 rather than 0, so a provider's opening 0 % event is still reported.
		let reported = -1;

		try {
			const backend = await resolved.LanguageModel.create({
				initialPrompts: toInitialPrompts(options.systemPrompt, options.turns),
				temperature: options.temperature,
				topK: options.topK,
				signal: options.signal,
				monitor: options.onProgress
					? (target) => {
							target.addEventListener('downloadprogress', (event) => {
								const fraction = normalizeProgressEvent(event);
								if (fraction === undefined) return;
								const next = clampFraction(fraction);
								// Drops both duplicates and the occasional regression, so the bar only
								// ever advances however the provider chooses to report.
								if (next <= reported) return;
								reported = next;
								options.onProgress?.({ phase: phaseForFraction(next), fraction: next });
							});
						}
					: undefined
			});

			handles.set(options.key, backend);
			return backend;
		} catch (error) {
			throw new LlmError(classifyLoadError(error), { cause: error });
		}
	}

	function destroyHandle(key: string): void {
		const backend = handles.get(key);
		if (!backend) return;
		backend.destroy();
		handles.delete(key);
	}

	/** Frees slots so a new handle fits, never evicting the one about to be used. */
	function evictFor(keepKey: string): void {
		while (handles.size >= maxLiveSessions) {
			const stale = [...handles.keys()].find((key) => key !== keepKey);
			if (stale === undefined) return;
			destroyHandle(stale);
		}
	}

	async function backendFor(session: AdapterSession): Promise<LanguageModelSessionLike> {
		await ensureProvider();
		const key = session.key;

		const existing = handles.get(key);
		if (existing) {
			// Re-insert so LRU eviction picks a genuinely stale handle.
			handles.delete(key);
			handles.set(key, existing);
			return existing;
		}

		evictFor(key);
		return createHandle({
			key,
			systemPrompt: session.config.systemPrompt,
			turns: session.historyForReplay(),
			temperature: session.config.temperature,
			topK: session.config.topK
		});
	}

	const runtime: AdapterRuntime = {
		async prepareTurn(session, text) {
			const backend = await backendFor(session);
			return { input: text, backend };
		},
		discardHandleFor(key) {
			destroyHandle(key);
		},
		releaseSession(key) {
			sessions.delete(key);
			destroyHandle(key);
		}
	};

	return {
		modelId,

		async availability(): Promise<LlmAvailability> {
			const resolved = await ensureProvider();
			const reported = await resolved.LanguageModel.availability({
				expectedInputs: [{ type: 'text' }],
				expectedOutputs: [{ type: 'text' }]
			});
			if (reported === 'unavailable') return 'unsupported';
			if (reported === 'available') return 'ready';
			return 'downloadable';
		},

		async load(opts = {}): Promise<void> {
			throwIfAborted(opts.signal);
			await ensureProvider();

			if (warmedUp) {
				opts.onProgress?.({ phase: 'prepare', fraction: 1 });
				return;
			}

			// A throwaway handle, created once — nothing else may trigger the first create(), or the
			// splash's progress bar would miss the very download it exists to show. It doesn't need to
			// stick around: the provider caches the download independently, and every real session
			// gets its own handle anyway.
			await createHandle({
				key: WARMUP_HANDLE,
				systemPrompt: '',
				turns: [],
				signal: opts.signal,
				onProgress: opts.onProgress
			});
			destroyHandle(WARMUP_HANDLE);
			warmedUp = true;

			opts.onProgress?.({ phase: 'prepare', fraction: 1 });
		},

		async createSession(key: string, sessionConfig: LlmSessionConfig): Promise<LlmSession> {
			await ensureProvider();
			const existing = sessions.get(key);
			if (existing) {
				// Same key, new instruction (the scene moved on): keep the conversation, swap the
				// persona. The instruction lives inside the backend handle, so that handle has to go —
				// `createHandle` rebuilds it from `historyForReplay()`, which makes the swap lossless.
				if (existing.reconfigure(sessionConfig)) {
					destroyHandle(key);
				}
				return existing;
			}

			const session = new AdapterSession(key, modelId, sessionConfig, runtime);
			sessions.set(key, session);
			return session;
		},

		async dispose(): Promise<void> {
			for (const key of [...handles.keys()]) destroyHandle(key);
			sessions.clear();
			provider = undefined;
			warmedUp = false;
		}
	};
}

/** Convenience for callers that only need the capability figure, not the whole descriptor. */
export function modelVramRequiredMB(modelId: LocalModelId): number {
	return findModel(modelId).vramRequiredMB;
}
