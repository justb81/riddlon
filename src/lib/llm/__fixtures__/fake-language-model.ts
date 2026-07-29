/**
 * A `LanguageModelLike` that behaves like the real providers without needing WebGPU.
 *
 * This is what makes `adapter.ts` testable in the Node test project: it fires the same
 * `downloadprogress` events the WebLLM polyfill fires, streams from a scripted chunk list, and
 * records how often the adapter actually called `create()`/`destroy()` — which is the only way to
 * assert the session-pooling behaviour the polyfill forces on us.
 */

import type {
	LanguageModelLike,
	LanguageModelSessionLike,
	PromptApiAvailability,
	PromptApiCreateOptions,
	PromptApiPromptOptions,
	ProviderKind,
	ResolvedProvider
} from '../types.js';

export interface FakeCall {
	input: string;
	options?: PromptApiPromptOptions;
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
}

const DEFAULT_CHUNKS = ['Ich ', 'war ', 'zu Hause.'];

export function createFakeLanguageModel(
	options: FakeLanguageModelOptions = {}
): FakeLanguageModel {
	const chunks = options.chunks ?? DEFAULT_CHUNKS;
	const progress = options.progress ?? [0, 0.5, 1];

	let createCount = 0;
	let destroyCount = 0;
	let liveSessions = 0;
	const createOptions: PromptApiCreateOptions[] = [];
	const calls: FakeCall[] = [];

	function makeSession(): LanguageModelSessionLike {
		liveSessions += 1;
		let destroyed = false;

		function guard(): void {
			if (destroyed) throw new DOMException('Session destroyed', 'InvalidStateError');
		}

		return {
			async prompt(input, promptOptions) {
				guard();
				calls.push({ input, options: promptOptions });
				if (promptOptions?.signal?.aborted) {
					throw new DOMException('Aborted', 'AbortError');
				}
				return chunks.join('');
			},
			promptStreaming(input, promptOptions) {
				guard();
				calls.push({ input, options: promptOptions });
				const failAfter = options.failStreamAfter;
				const signal = promptOptions?.signal;

				return new ReadableStream<string>({
					async pull(controller) {
						for (let i = 0; i < chunks.length; i += 1) {
							if (signal?.aborted) {
								controller.error(new DOMException('Aborted', 'AbortError'));
								return;
							}
							if (failAfter !== undefined && i >= failAfter) {
								controller.error(new Error('Device lost'));
								return;
							}
							controller.enqueue(chunks[i]);
						}
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
						new ProgressEvent('downloadprogress', {
							loaded: fraction,
							total: 1,
							lengthComputable: true
						})
					);
				}
			}

			if (createOpts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
			if (options.createError) throw options.createError;

			createCount += 1;
			return makeSession();
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
