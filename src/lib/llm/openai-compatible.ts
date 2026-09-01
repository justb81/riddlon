/**
 * A direct `LanguageModelLike` over any OpenAI-compatible `/chat/completions` endpoint — Ollama,
 * LM Studio, llama.cpp, vLLM, OpenRouter, Groq, and Google's own OpenAI-compatibility layer all
 * speak it, so one provider covers every server a player is likely to point us at.
 *
 * No SDK: the `openai` package would be dead weight in the bundle for every player who never
 * configures an endpoint, and the wire format below is small enough that plain `fetch` is the
 * honest implementation rather than a compromise. (That is a bundle-size argument, not a policy
 * one — there is no longer any rule against reaching a cloud provider; see `docs/concept.md` §2.)
 *
 * `create()`/`availability()` never touch the network — only `prompt()`/`promptStreaming()` do —
 * so resolving this provider, and the adapter's warm-up handle, cost nothing.
 */

import { LlmError, type LlmErrorCode } from './errors.js';
import type { InferenceEndpointConfig } from './endpoint-config.js';
import type {
	LanguageModelLike,
	LanguageModelSessionLike,
	PromptApiAvailability,
	PromptApiCreateOptions,
	PromptApiMessage,
	PromptApiPromptOptions
} from './types.js';

interface ChatCompletionChunk {
	choices?: Array<{ delta?: { content?: string | null } }>;
}

interface ChatCompletion {
	choices?: Array<{ message?: { content?: string | null } }>;
}

interface ErrorBody {
	error?: { message?: string };
}

function authHeaders(apiKey: string | undefined): Record<string, string> {
	// A local Ollama or llama.cpp server rejects nothing and expects no key; sending an empty
	// bearer token would be worse than sending none.
	return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

function codeForStatus(status: number): LlmErrorCode {
	if (status === 401 || status === 403) return 'invalid-api-key';
	if (status === 429) return 'quota-exceeded';
	return 'unknown';
}

/**
 * Some gateways ignore `stream: true` and answer with one whole completion. Reading the content
 * type rather than assuming SSE turns that from a silently empty reply into a working (if
 * un-streamed) one.
 */
function isEventStream(response: Response): boolean {
	return (response.headers.get('content-type') ?? '').includes('text/event-stream');
}

async function throwForErrorResponse(response: Response): Promise<never> {
	let message = `${response.status} ${response.statusText}`;
	try {
		const body = (await response.json()) as ErrorBody;
		if (body.error?.message) message = body.error.message;
	} catch {
		// Body wasn't JSON — the status text above is all we get.
	}
	throw new LlmError(codeForStatus(response.status), { cause: new Error(message) });
}

class OpenAiCompatibleSession implements LanguageModelSessionLike {
	#messages: PromptApiMessage[];
	#destroyed = false;
	#temperature?: number;

	constructor(
		private readonly config: InferenceEndpointConfig,
		options: PromptApiCreateOptions | undefined
	) {
		this.#messages = [...(options?.initialPrompts ?? [])];
		this.#temperature = options?.temperature;
		// `topK` is deliberately dropped: the OpenAI chat schema has no `top_k`, and quietly
		// re-routing it to `top_p` would change the sampling the caller actually asked for.
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
		const messages: PromptApiMessage[] = [...this.#messages, { role: 'user', content: input }];

		return new ReadableStream<string>({
			start: async (controller) => {
				if (signal?.aborted) {
					controller.error(signal.reason ?? new DOMException('Aborted', 'AbortError'));
					return;
				}

				let response: Response;
				try {
					response = await fetch(`${this.config.baseUrl}/chat/completions`, {
						method: 'POST',
						headers: { 'content-type': 'application/json', ...authHeaders(this.config.apiKey) },
						body: JSON.stringify({
							model: this.config.model,
							messages,
							stream: true,
							temperature: this.#temperature
						}),
						signal
					});
				} catch (error) {
					if (signal?.aborted) {
						controller.error(signal.reason ?? new DOMException('Aborted', 'AbortError'));
					} else {
						// Also the CORS case: a server on the local network has to allow this origin.
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

				let produced: string;
				try {
					produced = isEventStream(response)
						? await this.#pumpEventStream(response.body, controller)
						: await this.#pumpWholeCompletion(response, controller);
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

	async #pumpEventStream(
		body: ReadableStream<Uint8Array>,
		controller: ReadableStreamDefaultController<string>
	): Promise<string> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let produced = '';

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
				// The sentinel Gemini's SSE doesn't have; parsing it as JSON would throw.
				if (payload === '[DONE]') return produced;

				const chunk = JSON.parse(payload) as ChatCompletionChunk;
				const delta = chunk.choices?.[0]?.delta?.content;
				if (!delta) continue;
				produced += delta;
				controller.enqueue(delta);
			}
		}

		return produced;
	}

	async #pumpWholeCompletion(
		response: Response,
		controller: ReadableStreamDefaultController<string>
	): Promise<string> {
		const body = (await response.json()) as ChatCompletion;
		const content = body.choices?.[0]?.message?.content ?? '';
		if (content) controller.enqueue(content);
		return content;
	}

	destroy(): void {
		// Nothing owned per-session: each turn is a stateless REST call, so there is no backend
		// resource to release — only our own conversation record, which just stops being used.
		this.#destroyed = true;
	}
}

/** Builds a `LanguageModelLike` for one endpoint configuration, over plain `fetch`. */
export function createOpenAiCompatibleLanguageModel(
	config: InferenceEndpointConfig
): LanguageModelLike {
	return {
		async availability(): Promise<PromptApiAvailability> {
			return config.baseUrl && config.model ? 'available' : 'unavailable';
		},

		async create(options?: PromptApiCreateOptions): Promise<LanguageModelSessionLike> {
			if (options?.signal?.aborted) {
				throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
			}

			// There is no download for a remote model — report done immediately so a caller's progress
			// bar (built for a real weight download) doesn't sit waiting for an event that never comes.
			if (options?.monitor) {
				const target = new EventTarget();
				options.monitor(target);
				target.dispatchEvent(
					new ProgressEvent('downloadprogress', { loaded: 1, total: 1, lengthComputable: true })
				);
			}

			return new OpenAiCompatibleSession(config, options);
		}
	};
}

/**
 * One cheap round-trip, for the "Verbindung testen" button in settings.
 *
 * A configured endpoint outranks a working local model, so a typo would otherwise only surface as a
 * silently dead chat on the player's first message — the address is never contacted before that.
 *
 * A 404 counts as reachable: not every gateway serves `/models`, and any HTTP response at all
 * already proves the host resolves and CORS allows this origin, which is what actually goes wrong.
 */
export async function testEndpoint(
	config: InferenceEndpointConfig,
	signal?: AbortSignal
): Promise<{ ok: true } | { ok: false; code: LlmErrorCode }> {
	let response: Response;
	try {
		response = await fetch(`${config.baseUrl}/models`, {
			headers: authHeaders(config.apiKey),
			signal
		});
	} catch {
		return { ok: false, code: signal?.aborted ? 'aborted' : 'download-failed' };
	}

	if (response.ok || response.status === 404) return { ok: true };
	return { ok: false, code: codeForStatus(response.status) };
}
