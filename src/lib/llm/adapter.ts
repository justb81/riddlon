/**
 * The adapter `engine/` and `ui/` talk to. Everything model- and backend-specific stops here.
 *
 * Two behaviours in this file exist purely because of how the WebLLM polyfill works, and both are
 * invisible from the outside:
 *
 *  - Every `LanguageModel.create()` under the polyfill builds a fresh MLCEngine — a full weight load
 *    plus shader compile, tens of seconds. So `load()` creates exactly one backend handle and keeps
 *    it warm, and logical sessions share it (`personaMode: 'inline'`): persona and history travel in
 *    each prompt instead of living in a per-character session. The native provider has no such cost,
 *    so it gets a real handle per session (`'session'`).
 *  - Aborting mid-generation leaves the backend's conversation state undefined and neither
 *    implementation documents a guarantee, so an interrupted handle is discarded and transparently
 *    rebuilt from the turns we recorded ourselves.
 *
 * Because history lives here rather than only inside the backend, a rebuild is lossless — and
 * persisting it later (#5/#7 savegames) needs no interface change.
 */

import { findModel, type LocalModelId } from './catalog.js';
import { LlmError, classifyLoadError } from './errors.js';
import { clampFraction, normalizeProgressEvent, phaseForFraction } from './progress.js';
import { readableToAsyncIterable, throwIfAborted, toDeltas } from './stream.js';
import {
	DEFAULT_MAX_HISTORY_TURNS,
	appendTurn,
	buildTurnPrompt,
	toInitialPrompts,
	windowTurns
} from './turns.js';
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

/** Key of the handle `load()` warms, and the one every session shares in inline mode. */
const SHARED_HANDLE = '__shared__';

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
	let personaMode: NonNullable<LlmAdapterConfig['personaMode']> = 'inline';
	let maxLiveSessions = 1;

	/** Live backend handles, least-recently-used first. */
	const handles = new Map<string, LanguageModelSessionLike>();
	const sessions = new Map<string, AdapterSession>();

	async function ensureProvider(): Promise<ResolvedProvider> {
		if (!provider) {
			provider = await deps.resolveProvider(modelId);
			// The polyfill can only afford one live engine; the built-in model has no load cost.
			personaMode = config.personaMode ?? (provider.kind === 'native' ? 'session' : 'inline');
			maxLiveSessions = config.maxLiveSessions ?? (provider.kind === 'native' ? 4 : 1);
		}
		return provider;
	}

	function handleKeyFor(sessionKey: string): string {
		return personaMode === 'inline' ? SHARED_HANDLE : sessionKey;
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
		const key = handleKeyFor(session.key);

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
			// Inline mode primes the shared handle with nothing: persona and history go into every
			// prompt instead, because the handle is shared across characters.
			systemPrompt: personaMode === 'inline' ? '' : session.config.systemPrompt,
			turns: personaMode === 'inline' ? [] : session.historyForReplay(),
			temperature: session.config.temperature,
			topK: session.config.topK
		});
	}

	const runtime: AdapterRuntime = {
		async prepareTurn(session, text) {
			const backend = await backendFor(session);
			const input =
				personaMode === 'inline'
					? buildTurnPrompt(session.config.systemPrompt, session.historyForReplay(), text)
					: text;
			return { input, backend };
		},
		discardHandleFor(key) {
			destroyHandle(handleKeyFor(key));
		},
		releaseSession(key) {
			sessions.delete(key);
			// The shared handle outlives any single session, so only per-session handles go.
			if (personaMode !== 'inline') destroyHandle(key);
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

			if (handles.has(SHARED_HANDLE)) {
				opts.onProgress?.({ phase: 'prepare', fraction: 1 });
				return;
			}

			// One warm handle, created once — nothing else may trigger the first create(), or the
			// splash's progress bar would miss the very download it exists to show.
			await createHandle({
				key: SHARED_HANDLE,
				systemPrompt: '',
				turns: [],
				signal: opts.signal,
				onProgress: opts.onProgress
			});

			// In session mode this handle was only ever a vehicle for the download (which the
			// provider caches independently), so don't let it squat a slot.
			if (personaMode !== 'inline') destroyHandle(SHARED_HANDLE);

			opts.onProgress?.({ phase: 'prepare', fraction: 1 });
		},

		async createSession(key: string, sessionConfig: LlmSessionConfig): Promise<LlmSession> {
			await ensureProvider();
			const existing = sessions.get(key);
			if (existing) {
				// Same key, new instruction (the scene moved on): keep the conversation, swap the
				// persona. In session mode the instruction lives inside the backend handle, so that
				// handle has to go — `createHandle` rebuilds it from `historyForReplay()`, which makes
				// the swap lossless. Inline mode renders the persona into every prompt anyway.
				if (existing.reconfigure(sessionConfig) && personaMode !== 'inline') {
					destroyHandle(handleKeyFor(key));
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
		}
	};
}

/** Convenience for callers that only need the capability figure, not the whole descriptor. */
export function modelVramRequiredMB(modelId: LocalModelId): number {
	return findModel(modelId).vramRequiredMB;
}
