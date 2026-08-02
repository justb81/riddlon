/**
 * A direct `LanguageModelLike` over the Gemini REST API — issue #84's rescue path for a device that
 * can run neither the native Prompt API nor any WebLLM catalog tier. No SDK: `@google/genai` would
 * be dead weight for every player who never opts into this, same reasoning as the
 * Firebase/Gemini/OpenAI/Transformers.js stubs in `vite.config.ts` (those stub the polyfill's own
 * optional cloud backends; this is a separate, deliberate BYOK path). `create()`/`availability()`
 * never touch the network — only `prompt()`/`promptStreaming()` do, so resolving a Gemini provider,
 * and the adapter's warm-up handle, cost nothing.
 */

import { LlmError } from './errors.js';
import type {
	LanguageModelLike,
	LanguageModelSessionLike,
	PromptApiAvailability,
	PromptApiCreateOptions,
	PromptApiMessage,
	PromptApiPromptOptions
} from './types.js';

/** Free-tier, low-latency model — a story session's chat volume fits comfortably inside its quota. */
export const DEFAULT_GEMINI_MODEL_ID = 'gemini-2.0-flash';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiPart {
	text: string;
}

interface GeminiContent {
	role: 'user' | 'model';
	parts: GeminiPart[];
}

interface GeminiStreamChunk {
	candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}

interface GeminiErrorBody {
	error?: { message?: string };
}

/** Gemini has no separate system-message list: a `system` turn becomes `systemInstruction`. */
function toGeminiContents(messages: readonly PromptApiMessage[]): {
	systemInstruction?: { parts: GeminiPart[] };
	contents: GeminiContent[];
} {
	const systemParts = messages
		.filter((message) => message.role === 'system')
		.map((message) => ({ text: message.content }));
	const contents = messages
		.filter((message) => message.role !== 'system')
		.map((message) => ({
			role: message.role === 'assistant' ? ('model' as const) : ('user' as const),
			parts: [{ text: message.content }]
		}));
	return {
		systemInstruction: systemParts.length ? { parts: systemParts } : undefined,
		contents
	};
}

async function throwForErrorResponse(response: Response): Promise<never> {
	let message = `${response.status} ${response.statusText}`;
	try {
		const body = (await response.json()) as GeminiErrorBody;
		if (body.error?.message) message = body.error.message;
	} catch {
		// Body wasn't JSON — the status text above is all we get.
	}

	if (response.status === 401 || response.status === 403) {
		throw new LlmError('invalid-api-key', { cause: new Error(message) });
	}
	if (response.status === 429) {
		throw new LlmError('quota-exceeded', { cause: new Error(message) });
	}
	throw new LlmError('unknown', { cause: new Error(message) });
}

class GeminiSession implements LanguageModelSessionLike {
	#messages: PromptApiMessage[];
	#destroyed = false;
	#temperature?: number;
	#topK?: number;

	constructor(
		private readonly apiKey: string,
		private readonly modelId: string,
		options: PromptApiCreateOptions | undefined
	) {
		this.#messages = [...(options?.initialPrompts ?? [])];
		this.#temperature = options?.temperature;
		this.#topK = options?.topK;
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
		const { systemInstruction, contents } = toGeminiContents([
			...this.#messages,
			{ role: 'user', content: input }
		]);

		return new ReadableStream<string>({
			start: async (controller) => {
				if (signal?.aborted) {
					controller.error(signal.reason ?? new DOMException('Aborted', 'AbortError'));
					return;
				}

				let response: Response;
				try {
					response = await fetch(
						`${API_ROOT}/models/${this.modelId}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
						{
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								systemInstruction,
								contents,
								generationConfig: { temperature: this.#temperature, topK: this.#topK }
							}),
							signal
						}
					);
				} catch (error) {
					if (signal?.aborted) {
						controller.error(signal.reason ?? new DOMException('Aborted', 'AbortError'));
					} else {
						controller.error(new LlmError('download-failed', { cause: error }));
					}
					return;
				}

				if (!response.ok || !response.body) {
					try {
						await throwForErrorResponse(response);
					} catch (error) {
						controller.error(error);
					}
					return;
				}

				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';
				let produced = '';

				try {
					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						buffer += decoder.decode(value, { stream: true });

						let newlineIndex = buffer.indexOf('\n');
						while (newlineIndex !== -1) {
							const line = buffer.slice(0, newlineIndex).trim();
							buffer = buffer.slice(newlineIndex + 1);
							newlineIndex = buffer.indexOf('\n');

							if (!line.startsWith('data:')) continue;
							const payload = line.slice('data:'.length).trim();
							if (!payload) continue;

							const chunk = JSON.parse(payload) as GeminiStreamChunk;
							const delta =
								chunk.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ?? '';
							if (!delta) continue;
							produced += delta;
							controller.enqueue(delta);
						}
					}
				} catch (error) {
					if (!signal?.aborted) controller.error(error);
					return;
				}

				this.#messages.push(
					{ role: 'user', content: input },
					{ role: 'assistant', content: produced }
				);
				controller.close();
			}
		});
	}

	destroy(): void {
		// Nothing owned per-session: each turn is a stateless REST call, so there is no backend
		// resource to release — only our own conversation record, which just stops being used.
		this.#destroyed = true;
	}
}

/** Builds a `LanguageModelLike` for one Gemini API key + model, over plain `fetch`. */
export function createGeminiLanguageModel(
	apiKey: string,
	modelId: string = DEFAULT_GEMINI_MODEL_ID
): LanguageModelLike {
	return {
		async availability(): Promise<PromptApiAvailability> {
			return apiKey ? 'available' : 'unavailable';
		},

		async create(options?: PromptApiCreateOptions): Promise<LanguageModelSessionLike> {
			if (options?.signal?.aborted) {
				throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
			}

			// There is no download for a cloud model — report done immediately so a caller's progress
			// bar (built for a real weight download) doesn't sit waiting for an event that never comes.
			if (options?.monitor) {
				const target = new EventTarget();
				options.monitor(target);
				target.dispatchEvent(
					new ProgressEvent('downloadprogress', { loaded: 1, total: 1, lengthComputable: true })
				);
			}

			return new GeminiSession(apiKey, modelId, options);
		}
	};
}
