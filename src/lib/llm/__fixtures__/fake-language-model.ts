/**
 * A `LanguageModelLike` that behaves like the real providers without needing WebGPU.
 *
 * This is what makes `adapter.ts` testable in the Node test project: it fires the same
 * `downloadprogress` events the WebLLM polyfill fires, streams from a scripted chunk list, and
 * records how often the adapter actually called `create()`/`destroy()` — which is the only way to
 * assert the session-pooling behaviour the polyfill forces on us.
 *
 * It also models the one property of a real provider that is easy to forget and expensive to get
 * wrong: **a backend handle is stateful.** Both the built-in API and the polyfill append every
 * prompt and every answer to the handle's own conversation (`prompt-api-polyfill` does it in
 * `prompt()`/`promptStreaming()`), so what the model actually sees is `initialPrompts` plus that
 * whole accumulated history plus the new input — never just the string we passed. `conversations`
 * exposes exactly that, because a stateless fake makes the shared-handle path in `adapter.ts` look
 * far cleaner than it is (see `shared-handle.spec.ts`).
 */

import type {
	LanguageModelLike,
	LanguageModelSessionLike,
	PromptApiAvailability,
	PromptApiCreateOptions,
	PromptApiMessage,
	PromptApiPromptOptions,
	ProviderKind,
	ResolvedProvider
} from '../types.js';
import { createProgressEvent } from './progress-event.js';

export interface FakeCall {
	input: string;
	options?: PromptApiPromptOptions;
}

/** One backend handle's own conversation — what the model is really shown on the next turn. */
export interface FakeConversation {
	/** What `create({ initialPrompts })` seeded the handle with. */
	readonly seeded: readonly PromptApiMessage[];
	/** Prompts and answers the handle has accumulated since, in order. */
	readonly messages: readonly PromptApiMessage[];
	readonly destroyed: boolean;
}

export interface FakeLanguageModelOptions {
	kind?: ProviderKind;
	availability?: PromptApiAvailability;
	mlcModelId?: string;
	/** Chunks each `promptStreaming()` yields. Defaults to a short delta stream. */
	chunks?: readonly string[];
	/** Progress fractions dispatched on the `monitor` target during `create()`. */
	progress?: readonly number[];
	/** Throw from `create()` — for load-failure paths. */
	createError?: unknown;
	/** Throw partway through a stream, after emitting this many chunks. */
	failStreamAfter?: number;
}

export interface FakeLanguageModel extends LanguageModelLike {
	readonly createCount: number;
	readonly destroyCount: number;
	readonly liveSessions: number;
	readonly lastCreateOptions: PromptApiCreateOptions | undefined;
	readonly createOptions: readonly PromptApiCreateOptions[];
	readonly calls: readonly FakeCall[];
	/** One entry per handle `create()` produced, in creation order. */
	readonly conversations: readonly FakeConversation[];
}

const DEFAULT_CHUNKS = ['Ich ', 'war ', 'zu Hause.'];

export function createFakeLanguageModel(options: FakeLanguageModelOptions = {}): FakeLanguageModel {
	const chunks = options.chunks ?? DEFAULT_CHUNKS;
	const progress = options.progress ?? [0, 0.5, 1];

	let createCount = 0;
	let destroyCount = 0;
	let liveSessions = 0;
	const createOptions: PromptApiCreateOptions[] = [];
	const calls: FakeCall[] = [];
	const conversations: FakeConversation[] = [];

	function makeSession(createOpts: PromptApiCreateOptions): LanguageModelSessionLike {
		liveSessions += 1;
		let destroyed = false;

		// The handle's own history, exactly as a real provider keeps it: seeded once, then extended
		// by every completed turn. Only *completed* turns — the polyfill drops an aborted or failed
		// generation instead of recording half of it.
		const messages: PromptApiMessage[] = [];
		const conversation: FakeConversation = {
			seeded: [...(createOpts.initialPrompts ?? [])],
			messages,
			get destroyed() {
				return destroyed;
			}
		};
		conversations.push(conversation);

		function guard(): void {
			if (destroyed) throw new DOMException('Session destroyed', 'InvalidStateError');
		}

		function record(input: string, answer: string): void {
			messages.push({ role: 'user', content: input }, { role: 'assistant', content: answer });
		}

		return {
			async prompt(input, promptOptions) {
				guard();
				calls.push({ input, options: promptOptions });
				if (promptOptions?.signal?.aborted) {
					throw new DOMException('Aborted', 'AbortError');
				}
				const answer = chunks.join('');
				record(input, answer);
				return answer;
			},
			promptStreaming(input, promptOptions) {
				guard();
				calls.push({ input, options: promptOptions });
				const failAfter = options.failStreamAfter;
				const signal = promptOptions?.signal;

				return new ReadableStream<string>({
					async pull(controller) {
						let produced = '';
						for (let i = 0; i < chunks.length; i += 1) {
							if (signal?.aborted) {
								controller.error(new DOMException('Aborted', 'AbortError'));
								return;
							}
							if (failAfter !== undefined && i >= failAfter) {
								controller.error(new Error('Device lost'));
								return;
							}
							produced += chunks[i];
							controller.enqueue(chunks[i]);
						}
						record(input, produced);
						controller.close();
					}
				});
			},
			destroy() {
				if (destroyed) return;
				destroyed = true;
				destroyCount += 1;
				liveSessions -= 1;
			}
		};
	}

	return {
		async availability() {
			return options.availability ?? 'available';
		},
		async create(createOpts) {
			createOptions.push(createOpts ?? {});

			// The real providers hand the monitor target out and dispatch onto it during the load,
			// before the session resolves — mirror that ordering so progress wiring is exercised.
			if (createOpts?.monitor) {
				const target = new EventTarget();
				createOpts.monitor(target);
				for (const fraction of progress) {
					target.dispatchEvent(
						createProgressEvent('downloadprogress', { loaded: fraction, total: 1 })
					);
				}
			}

			if (createOpts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
			if (options.createError) throw options.createError;

			createCount += 1;
			return makeSession(createOpts ?? {});
		},
		get createCount() {
			return createCount;
		},
		get destroyCount() {
			return destroyCount;
		},
		get liveSessions() {
			return liveSessions;
		},
		get lastCreateOptions() {
			return createOptions.at(-1);
		},
		get createOptions() {
			return createOptions;
		},
		get calls() {
			return calls;
		},
		get conversations() {
			return conversations;
		}
	};
}

export interface FakeProvider extends ResolvedProvider {
	LanguageModel: FakeLanguageModel;
	/** Model ids the adapter asked to resolve, in order. */
	readonly resolvedFor: readonly string[];
}

/**
 * A `resolveProvider` dependency plus the fake it hands back, so a spec can assert on both the
 * adapter's behaviour and what configuration the provider was asked for.
 */
export function createFakeProvider(options: FakeLanguageModelOptions = {}): {
	provider: FakeProvider;
	resolveProvider: (modelId: string) => Promise<ResolvedProvider>;
} {
	const LanguageModel = createFakeLanguageModel(options);
	const resolvedFor: string[] = [];

	const provider: FakeProvider = {
		kind: options.kind ?? 'polyfill',
		LanguageModel,
		mlcModelId: options.mlcModelId,
		get resolvedFor() {
			return resolvedFor;
		}
	};

	return {
		provider,
		resolveProvider: async (modelId: string) => {
			resolvedFor.push(modelId);
			return provider;
		}
	};
}
