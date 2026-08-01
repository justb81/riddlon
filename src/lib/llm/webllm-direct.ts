/**
 * A direct `LanguageModelLike` over `@mlc-ai/web-llm` — issue #69's fix.
 *
 * `prompt-api-polyfill`'s own WebLLM backend (`prompt-api-polyfill/dist/backends/webllm.js`)
 * instantiates a brand-new backend wrapper object on every `LanguageModel.create()`, and that
 * wrapper's engine field always starts empty — so every logical session paid a full
 * `CreateMLCEngine()`: weight load plus shader compile, tens of seconds. That is the entire reason
 * `adapter.ts` used to keep one shared handle and bake persona + history into prompt text instead of
 * giving every character a real session (`personaMode: 'inline'`, see `shared-handle.spec.ts` for
 * what that shared handle actually did to the director's JSON request and to character bleed).
 *
 * The reload was never necessary. `MLCEngine.chat.completions.create()` is a stateless,
 * OpenAI-style call — you pass the full message array every time — and `MLCEngine.prefill()`
 * already compares that array against whatever conversation is currently loaded: matching turns
 * reuse the KV cache, a mismatch resets it (a cheap operation, not a reload). The polyfill's own
 * session object already relies on exactly this: it rebuilds its `[...history, next]` array from
 * scratch on every call, never trusting the engine to remember anything across turns. So one
 * persistent `MLCEngine`, reused across every logical session, gives every character (and the
 * director) an isolated conversation with no shared-handle contamination, at the cost of a KV-cache
 * reset when the active session changes — not a multi-second reload. Manually calling
 * `engine.resetChat()` between turns, the fix issue #69 originally proposed, turns out to be
 * unnecessary: passing the full array already gets the equivalent behaviour for free.
 *
 * `catalog.ts`'s device-sizing rule (barely one instance of the largest supported model fits)
 * means only one engine may ever be live, regardless of how many logical sessions exist — so this
 * module, not `provider.ts`, owns the one persistent `MLCEngine` and reloads it only when the
 * selected model id actually changes.
 */

import type {
	LanguageModelLike,
	LanguageModelSessionLike,
	PromptApiAvailability,
	PromptApiCreateOptions,
	PromptApiMessage,
	PromptApiPromptOptions
} from './types.js';
import { LlmError, classifyLoadError } from './errors.js';

/** Structural subset of `@mlc-ai/web-llm`'s `MLCEngine` — enough to drive chat completions. */
interface MlcChatCompletionChunk {
	choices: Array<{ delta?: { content?: string } }>;
}

interface MlcChatCompletion {
	choices: Array<{ message: { content: string } }>;
}

interface MlcEngineLike {
	chat: {
		completions: {
			create(request: {
				messages: PromptApiMessage[];
				stream: boolean;
				temperature?: number;
			}): Promise<AsyncIterable<MlcChatCompletionChunk> | MlcChatCompletion>;
		};
	};
	interruptGenerate(): Promise<void>;
	unload(): Promise<void>;
}

/** The one live engine, and the model id it was loaded with — reused across every session. */
let engine: MlcEngineLike | undefined;
let engineMlcModelId: string | undefined;
let loading: { mlcModelId: string; promise: Promise<MlcEngineLike> } | undefined;

async function ensureEngine(
	mlcModelId: string,
	onProgress?: (fraction: number) => void
): Promise<MlcEngineLike> {
	if (engine && engineMlcModelId === mlcModelId) return engine;
	if (loading?.mlcModelId === mlcModelId) return loading.promise;

	const promise = (async () => {
		const { CreateMLCEngine, prebuiltAppConfig } = await import('@mlc-ai/web-llm');

		if (engine) {
			await engine.unload().catch(() => undefined);
			engine = undefined;
			engineMlcModelId = undefined;
		}

		const created = (await CreateMLCEngine(mlcModelId, {
			appConfig: { ...prebuiltAppConfig, cacheBackend: 'cross-origin' },
			initProgressCallback: onProgress ? (report) => onProgress(report.progress) : undefined
		})) as unknown as MlcEngineLike;

		engine = created;
		engineMlcModelId = mlcModelId;
		return created;
	})();

	loading = { mlcModelId, promise };
	try {
		return await promise;
	} finally {
		if (loading?.promise === promise) loading = undefined;
	}
}

class WebLlmSession implements LanguageModelSessionLike {
	#messages: PromptApiMessage[];
	#temperature?: number;
	#destroyed = false;

	constructor(
		private readonly mlcModelId: string,
		options: PromptApiCreateOptions | undefined
	) {
		this.#messages = [...(options?.initialPrompts ?? [])];
		this.#temperature = options?.temperature;
	}

	async prompt(input: string, opts: PromptApiPromptOptions = {}): Promise<string> {
		let answer = '';
		const reader = this.promptStreaming(input, opts).getReader();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				answer += value;
			}
		} finally {
			reader.releaseLock();
		}
		return answer;
	}

	promptStreaming(input: string, opts: PromptApiPromptOptions = {}): ReadableStream<string> {
		if (this.#destroyed) throw new DOMException('Session destroyed', 'InvalidStateError');
		const signal = opts.signal;
		const messages = [...this.#messages, { role: 'user' as const, content: input }];

		return new ReadableStream<string>({
			start: async (controller) => {
				if (signal?.aborted) {
					controller.error(signal.reason ?? new DOMException('Aborted', 'AbortError'));
					return;
				}

				let engineHandle: MlcEngineLike;
				try {
					engineHandle = await ensureEngine(this.mlcModelId);
				} catch (error) {
					controller.error(new LlmError(classifyLoadError(error), { cause: error }));
					return;
				}

				const onAbort = () => {
					engineHandle.interruptGenerate().catch(() => undefined);
					controller.error(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
				};
				signal?.addEventListener('abort', onAbort, { once: true });

				let produced = '';
				try {
					const stream = (await engineHandle.chat.completions.create({
						messages,
						stream: true,
						temperature: this.#temperature
					})) as AsyncIterable<MlcChatCompletionChunk>;

					for await (const chunk of stream) {
						if (signal?.aborted) return;
						const delta = chunk.choices[0]?.delta?.content ?? '';
						if (!delta) continue;
						produced += delta;
						controller.enqueue(delta);
					}

					if (!signal?.aborted) {
						this.#messages.push(
							{ role: 'user', content: input },
							{ role: 'assistant', content: produced }
						);
						controller.close();
					}
				} catch (error) {
					if (!signal?.aborted) controller.error(error);
				} finally {
					signal?.removeEventListener('abort', onAbort);
				}
			},
			cancel: async () => {
				await engine?.interruptGenerate().catch(() => undefined);
			}
		});
	}

	destroy(): void {
		// Nothing owned per-session: the engine is shared, so there is no backend resource to release.
		this.#destroyed = true;
	}
}

/** Builds a `LanguageModelLike` for one catalog model, backed by the one persistent engine above. */
export function createWebLlmLanguageModel(mlcModelId: string): LanguageModelLike {
	return {
		async availability(): Promise<PromptApiAvailability> {
			// Matches the polyfill's own (documented) quirk: this can't tell "not yet downloaded" from
			// "downloading" without loading the engine, so callers use `model-cache.ts` for that instead.
			return 'available';
		},

		async create(options?: PromptApiCreateOptions): Promise<LanguageModelSessionLike> {
			if (options?.signal?.aborted) {
				throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
			}

			// Per the Prompt API contract, `monitor` is called once, synchronously, with a target the
			// caller can attach listeners to before any progress is dispatched onto it.
			const target = options?.monitor ? new EventTarget() : undefined;
			if (target) options?.monitor?.(target);

			let reported = -1;
			try {
				await ensureEngine(mlcModelId, (fraction) => {
					if (!target || fraction <= reported) return;
					reported = fraction;
					target.dispatchEvent(
						new ProgressEvent('downloadprogress', {
							loaded: fraction,
							total: 1,
							lengthComputable: true
						})
					);
				});
			} catch (error) {
				throw new LlmError(classifyLoadError(error), { cause: error });
			}

			return new WebLlmSession(mlcModelId, options);
		}
	};
}
