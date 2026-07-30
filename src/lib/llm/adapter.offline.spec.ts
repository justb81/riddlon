import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLlmAdapter } from './adapter.js';
import { createFakeProvider } from './__fixtures__/fake-language-model.js';

/**
 * Half of issue #12's second acceptance criterion — "a full run with no network after the model is
 * cached completes an in-story conversation turn".
 *
 * What this can prove: once the model is loaded, *our* code makes no network calls, so nothing in
 * `$lib/llm` is what would break offline. What it cannot prove: that the WebLLM engine itself stays
 * offline, since it isn't running here (no GPU in CI). That half is a manual check on real hardware.
 */

function hostileNetwork(): void {
	const explode = () => {
		throw new Error('network access attempted while offline');
	};
	vi.stubGlobal('fetch', vi.fn(explode));
	vi.stubGlobal(
		'XMLHttpRequest',
		class {
			open = explode;
			send = explode;
		}
	);
	vi.stubGlobal(
		'WebSocket',
		class {
			constructor() {
				explode();
			}
		}
	);
	vi.stubGlobal(
		'EventSource',
		class {
			constructor() {
				explode();
			}
		}
	);
	vi.stubGlobal('navigator', { onLine: false });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('offline conversation turn', () => {
	it('completes a streamed turn with every network API booby-trapped', async () => {
		const { adapter } = (() => {
			const { resolveProvider } = createFakeProvider({
				kind: 'polyfill',
				chunks: ['Ich war ', 'gegen acht ', 'noch im Büro.']
			});
			return { adapter: createLlmAdapter({ modelId: 'llama-3.2-3b' }, { resolveProvider }) };
		})();

		// Warm the model while the network still exists, as a first run would.
		await adapter.load();

		hostileNetwork();

		const session = await adapter.createSession('lucy', { systemPrompt: 'Du bist Lucy.' });
		let answer = '';
		for await (const delta of session.stream('Wo warst du gegen acht?')) answer += delta;

		expect(answer).toBe('Ich war gegen acht noch im Büro.');
		expect(session.turns).toHaveLength(2);
	});

	it('completes several consecutive turns offline', async () => {
		const { resolveProvider } = createFakeProvider({ kind: 'polyfill', chunks: ['ja'] });
		const adapter = createLlmAdapter({ modelId: 'llama-3.2-3b' }, { resolveProvider });
		await adapter.load();

		hostileNetwork();

		const session = await adapter.createSession('lucy', { systemPrompt: 'Du bist Lucy.' });
		await session.prompt('Erste Frage');
		await session.prompt('Zweite Frage');
		await session.prompt('Dritte Frage');

		expect(session.turns).toHaveLength(6);
	});

	it('serves a second character offline without rebuilding the engine', async () => {
		// A rebuild would mean re-reading weights, which is exactly what must not be needed offline.
		const { provider, resolveProvider } = createFakeProvider({ kind: 'polyfill', chunks: ['ok'] });
		const adapter = createLlmAdapter({ modelId: 'llama-3.2-3b' }, { resolveProvider });
		await adapter.load();

		hostileNetwork();

		const lucy = await adapter.createSession('lucy', { systemPrompt: 'Du bist Lucy.' });
		const max = await adapter.createSession('max', { systemPrompt: 'Du bist Max.' });
		await lucy.prompt('Hallo Lucy');
		await max.prompt('Hallo Max');

		expect(provider.LanguageModel.createCount).toBe(1);
	});
});
