import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleLanguageModel, testEndpoint } from './openai-compatible.js';
import { isLlmError } from './errors.js';
import type { InferenceEndpointConfig } from './endpoint-config.js';
import type { LanguageModelSessionLike } from './types.js';

/**
 * The BYOK REST layer this replaces (`gemini-direct.ts`) had no spec at all — every one of its
 * failure modes was a browser-only discovery. Nothing here needs a browser: the wire format is
 * plain `fetch`, so a stubbed global covers streaming, the `[DONE]` sentinel, the non-streaming
 * fallback and the whole status-code table in Node.
 */

const CONFIG: InferenceEndpointConfig = { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' };

function sseResponse(lines: readonly string[]): Response {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
			controller.close();
		}
	});
	return new Response(body, {
		status: 200,
		headers: { 'content-type': 'text/event-stream' }
	});
}

function deltaLine(content: string): string {
	return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`;
}

function stubFetch(impl: (...args: Parameters<typeof fetch>) => Promise<Response>) {
	const spy = vi.fn(impl);
	vi.stubGlobal('fetch', spy);
	return spy;
}

async function drain(session: LanguageModelSessionLike, input: string): Promise<string> {
	return session.prompt(input);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('streaming', () => {
	it('yields deltas and skips the [DONE] sentinel', async () => {
		stubFetch(async () =>
			sseResponse([deltaLine('Hallo'), deltaLine(' Welt'), 'data: [DONE]', ''])
		);

		const model = createOpenAiCompatibleLanguageModel(CONFIG);
		const session = await model.create();
		const chunks: string[] = [];
		const reader = session.promptStreaming('hi').getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}

		expect(chunks).toEqual(['Hallo', ' Welt']);
	});

	it('falls back to a whole completion when the server ignores stream:true', async () => {
		stubFetch(
			async () =>
				new Response(JSON.stringify({ choices: [{ message: { content: 'Ganze Antwort' } }] }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);

		const model = createOpenAiCompatibleLanguageModel(CONFIG);
		const session = await model.create();
		expect(await drain(session, 'hi')).toBe('Ganze Antwort');
	});

	it('remembers the exchange, so the next turn replays it', async () => {
		const spy = stubFetch(async () => sseResponse([deltaLine('erste'), 'data: [DONE]']));

		const model = createOpenAiCompatibleLanguageModel(CONFIG);
		const session = await model.create({
			initialPrompts: [{ role: 'system', content: 'sei knapp' }]
		});
		await drain(session, 'frage eins');
		await drain(session, 'frage zwei');

		const secondBody = JSON.parse(String(spy.mock.calls[1]?.[1]?.body));
		expect(secondBody.messages).toEqual([
			{ role: 'system', content: 'sei knapp' },
			{ role: 'user', content: 'frage eins' },
			{ role: 'assistant', content: 'erste' },
			{ role: 'user', content: 'frage zwei' }
		]);
	});
});

describe('request shape', () => {
	it('posts to /chat/completions with the configured model', async () => {
		const spy = stubFetch(async () => sseResponse(['data: [DONE]']));
		const session = await createOpenAiCompatibleLanguageModel(CONFIG).create();
		await drain(session, 'hi');

		expect(spy.mock.calls[0]?.[0]).toBe('http://localhost:11434/v1/chat/completions');
		expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toMatchObject({
			model: 'llama3.2',
			stream: true
		});
	});

	it('sends no authorization header when no key is configured', async () => {
		const spy = stubFetch(async () => sseResponse(['data: [DONE]']));
		const session = await createOpenAiCompatibleLanguageModel(CONFIG).create();
		await drain(session, 'hi');

		const headers = spy.mock.calls[0]?.[1]?.headers as Record<string, string>;
		expect(headers).not.toHaveProperty('authorization');
	});

	it('sends a bearer token when a key is configured', async () => {
		const spy = stubFetch(async () => sseResponse(['data: [DONE]']));
		const session = await createOpenAiCompatibleLanguageModel({
			...CONFIG,
			apiKey: 'sk-test'
		}).create();
		await drain(session, 'hi');

		const headers = spy.mock.calls[0]?.[1]?.headers as Record<string, string>;
		expect(headers.authorization).toBe('Bearer sk-test');
	});
});

describe('error mapping', () => {
	it.each([
		[401, 'invalid-api-key'],
		[403, 'invalid-api-key'],
		[429, 'quota-exceeded'],
		[500, 'unknown']
	])('maps HTTP %i to %s', async (status, code) => {
		stubFetch(
			async () =>
				new Response(JSON.stringify({ error: { message: 'nope' } }), {
					status,
					headers: { 'content-type': 'application/json' }
				})
		);

		const session = await createOpenAiCompatibleLanguageModel(CONFIG).create();
		const error = await drain(session, 'hi').catch((thrown: unknown) => thrown);
		expect(isLlmError(error) && error.code).toBe(code);
	});

	it('maps a network throw (also the CORS case) to download-failed', async () => {
		stubFetch(async () => {
			throw new TypeError('Failed to fetch');
		});

		const session = await createOpenAiCompatibleLanguageModel(CONFIG).create();
		const error = await drain(session, 'hi').catch((thrown: unknown) => thrown);
		expect(isLlmError(error) && error.code).toBe('download-failed');
	});

	it('rejects an already-aborted turn without calling fetch', async () => {
		const spy = stubFetch(async () => sseResponse(['data: [DONE]']));
		const session = await createOpenAiCompatibleLanguageModel(CONFIG).create();
		const controller = new AbortController();
		controller.abort();

		await expect(session.prompt('hi', { signal: controller.signal })).rejects.toThrow();
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('create() and availability()', () => {
	it('never touches the network', async () => {
		const spy = stubFetch(async () => sseResponse(['data: [DONE]']));
		const model = createOpenAiCompatibleLanguageModel(CONFIG);

		expect(await model.availability()).toBe('available');
		await model.create();
		expect(spy).not.toHaveBeenCalled();
	});

	it('reports a completed download at once, so a progress bar does not hang', async () => {
		// `ProgressEvent` is a DOM API Node doesn't provide; production only ever runs in a browser.
		// Same reasoning as `__fixtures__/progress-event.ts`, from the other side of the boundary.
		vi.stubGlobal(
			'ProgressEvent',
			class extends Event {
				readonly loaded: number;
				constructor(type: string, init: { loaded: number }) {
					super(type);
					this.loaded = init.loaded;
				}
			}
		);

		const model = createOpenAiCompatibleLanguageModel(CONFIG);
		const seen: number[] = [];
		await model.create({
			monitor: (target) => {
				target.addEventListener('downloadprogress', (event) => {
					seen.push((event as ProgressEvent).loaded);
				});
			}
		});

		expect(seen).toEqual([1]);
	});
});

describe('testEndpoint', () => {
	it('accepts a 200 from /models', async () => {
		const spy = stubFetch(async () => new Response('{}', { status: 200 }));
		expect(await testEndpoint(CONFIG)).toEqual({ ok: true });
		expect(spy.mock.calls[0]?.[0]).toBe('http://localhost:11434/v1/models');
	});

	it('accepts a 404, since not every gateway serves /models', async () => {
		stubFetch(async () => new Response('', { status: 404 }));
		expect(await testEndpoint(CONFIG)).toEqual({ ok: true });
	});

	it('reports a rejected key', async () => {
		stubFetch(async () => new Response('', { status: 401 }));
		expect(await testEndpoint(CONFIG)).toEqual({ ok: false, code: 'invalid-api-key' });
	});

	it('reports an unreachable host', async () => {
		stubFetch(async () => {
			throw new TypeError('Failed to fetch');
		});
		expect(await testEndpoint(CONFIG)).toEqual({ ok: false, code: 'download-failed' });
	});
});
