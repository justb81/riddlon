import { describe, expect, it, vi } from 'vitest';
import { createLlmAdapter } from './adapter.js';
import { LLM_MODELS, MODEL_ORDER, type LocalModelId } from './catalog.js';
import { isLlmError } from './errors.js';
import {
	createFakeProvider,
	type FakeLanguageModelOptions
} from './__fixtures__/fake-language-model.js';
import type { LlmProgress, LlmSessionConfig } from './types.js';

const LUCY: LlmSessionConfig = { systemPrompt: 'Du bist Lucy.' };
const MAX: LlmSessionConfig = { systemPrompt: 'Du bist Max.' };

function setup(modelId: LocalModelId, options: FakeLanguageModelOptions = {}) {
	const { provider, resolveProvider } = createFakeProvider(options);
	const adapter = createLlmAdapter({ modelId }, { resolveProvider });
	return { provider, adapter };
}

async function collect(source: AsyncIterable<string>): Promise<string[]> {
	const out: string[] = [];
	for await (const value of source) out.push(value);
	return out;
}

/**
 * Issue #12's first acceptance criterion, mechanised: the entire suite runs unchanged against every
 * model in the catalog. If swapping a model required different behaviour anywhere above the adapter,
 * one of these would have to differ — and none of them may.
 */
describe.each(MODEL_ORDER)('adapter with %s', (modelId) => {
	it('streams a turn as deltas', async () => {
		const { adapter } = setup(modelId, { chunks: ['Ich ', 'war ', 'zu Hause.'] });
		const session = await adapter.createSession('lucy', LUCY);
		expect(await collect(session.stream('Wo warst du?'))).toEqual(['Ich ', 'war ', 'zu Hause.']);
	});

	it('flattens a cumulative provider into deltas', async () => {
		const { adapter } = setup(modelId, { chunks: ['Ich', 'Ich war', 'Ich war da'] });
		const session = await adapter.createSession('lucy', LUCY);
		expect(await collect(session.stream('Wo warst du?'))).toEqual(['Ich', ' war', ' da']);
	});

	it('assembles the full answer via prompt()', async () => {
		const { adapter } = setup(modelId, { chunks: ['Ja', ', klar'] });
		const session = await adapter.createSession('lucy', LUCY);
		expect(await session.prompt('Stimmt das?')).toBe('Ja, klar');
	});

	it('records both sides of a completed turn', async () => {
		const { adapter } = setup(modelId, { chunks: ['Zuhause.'] });
		const session = await adapter.createSession('lucy', LUCY);
		await session.prompt('Wo warst du?');
		expect(session.turns).toEqual([
			{ role: 'user', content: 'Wo warst du?' },
			{ role: 'assistant', content: 'Zuhause.' }
		]);
	});

	it('resolves the provider for exactly this model', async () => {
		const { provider, adapter } = setup(modelId);
		await adapter.createSession('lucy', LUCY);
		expect(provider.resolvedFor).toEqual([modelId]);
	});

	it('reports availability in our own vocabulary', async () => {
		const ready = setup(modelId, { availability: 'available' });
		expect(await ready.adapter.availability()).toBe('ready');

		const downloadable = setup(modelId, { availability: 'downloadable' });
		expect(await downloadable.adapter.availability()).toBe('downloadable');

		const unsupported = setup(modelId, { availability: 'unavailable' });
		expect(await unsupported.adapter.availability()).toBe('unsupported');
	});
});

describe('load progress', () => {
	it('forwards the provider fractions monotonically and ends at 1', async () => {
		const { adapter } = setup('llama-3.2-3b', { progress: [0, 0.4, 0.3, 0.9, 1] });
		const seen: LlmProgress[] = [];
		await adapter.load({ onProgress: (p) => seen.push(p) });

		const fractions = seen.map((p) => p.fraction);
		expect(fractions[0]).toBe(0);
		expect(fractions.at(-1)).toBe(1);
		// The 0.3 regression must not appear, and nothing may decrease.
		expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
		expect(fractions).not.toContain(0.3);
	});

	it('labels the tail of the load as device preparation', async () => {
		const { adapter } = setup('llama-3.2-3b', { progress: [0, 0.5, 0.95] });
		const seen: LlmProgress[] = [];
		await adapter.load({ onProgress: (p) => seen.push(p) });
		expect(seen.find((p) => p.fraction === 0.5)?.phase).toBe('download');
		expect(seen.find((p) => p.fraction === 0.95)?.phase).toBe('prepare');
	});

	it('loads the model once, not once per call', async () => {
		const { provider, adapter } = setup('llama-3.2-3b');
		await adapter.load();
		await adapter.load();
		expect(provider.LanguageModel.createCount).toBe(1);
	});

	it('refuses to start when the signal is already aborted', async () => {
		const { provider, adapter } = setup('llama-3.2-3b');
		const controller = new AbortController();
		controller.abort();
		await expect(adapter.load({ signal: controller.signal })).rejects.toThrow(/abort/i);
		expect(provider.LanguageModel.createCount).toBe(0);
	});

	it('normalises a load failure into a classified LlmError', async () => {
		const { adapter } = setup('llama-3.2-3b', { createError: new TypeError('Failed to fetch') });
		await expect(adapter.load()).rejects.toMatchObject({
			name: 'LlmError',
			code: 'download-failed'
		});
	});
});

/**
 * Issue #69: the WebLLM path used to share one backend handle across every character (baking
 * persona + history into prompt text instead), because a second `create()` under
 * `prompt-api-polyfill` meant a full multi-gigabyte engine rebuild. `webllm-direct.ts` replaced
 * that with one persistent engine reused across cheap per-session handles, so the polyfill kind now
 * pools sessions exactly like the native provider — these mirror the native assertions below to
 * prove that parity holds.
 */
describe.each(['native', 'polyfill'] as const)('session pooling (%s)', (kind) => {
	it('gives each character its own backend session', async () => {
		const { provider, adapter } = setup('llama-3.2-3b', { kind });
		const lucy = await adapter.createSession('lucy', LUCY);
		const max = await adapter.createSession('max', MAX);
		await lucy.prompt('Hallo?');
		await max.prompt('Und du?');
		expect(provider.LanguageModel.createCount).toBe(2);
	});

	it('keeps each character in its own history', async () => {
		const { adapter } = setup('llama-3.2-3b', { kind, chunks: ['ok'] });
		const lucy = await adapter.createSession('lucy', LUCY);
		const max = await adapter.createSession('max', MAX);
		await lucy.prompt('Frage an Lucy');
		await max.prompt('Frage an Max');

		expect(lucy.turns.map((t) => t.content)).toEqual(['Frage an Lucy', 'ok']);
		expect(max.turns.map((t) => t.content)).toEqual(['Frage an Max', 'ok']);
	});

	it('primes each session with its own persona instead of inlining it', async () => {
		const { provider, adapter } = setup('llama-3.2-3b', { kind, chunks: ['ok'] });
		const lucy = await adapter.createSession('lucy', LUCY);
		await lucy.prompt('Wo warst du?');

		expect(provider.LanguageModel.lastCreateOptions?.initialPrompts).toEqual([
			{ role: 'system', content: 'Du bist Lucy.' }
		]);
		expect(provider.LanguageModel.calls.at(-1)?.input).toBe('Wo warst du?');
	});

	it('tears down a session’s own handle when it is destroyed', async () => {
		const { provider, adapter } = setup('llama-3.2-3b', { kind });
		const lucy = await adapter.createSession('lucy', LUCY);
		await lucy.prompt('Hallo?');
		await lucy.destroy();
		expect(provider.LanguageModel.destroyCount).toBe(1);
	});

	it('does not leave the warm-up handle occupying a slot', async () => {
		const { provider, adapter } = setup('llama-3.2-3b', { kind });
		await adapter.load();
		expect(provider.LanguageModel.liveSessions).toBe(0);
	});

	it('keeps several sessions live below the pool limit', async () => {
		const { provider, adapter } = setup('llama-3.2-3b', { kind, chunks: ['ok'] });
		const first = await adapter.createSession('a', LUCY);
		const second = await adapter.createSession('b', MAX);
		await first.prompt('eins');
		await second.prompt('zwei');

		// maxLiveSessions defaults to 4, so nothing should have been evicted.
		expect(provider.LanguageModel.liveSessions).toBe(2);
		expect(provider.LanguageModel.destroyCount).toBe(0);
	});

	it('rebuilds an evicted session from the recorded history', async () => {
		const { provider, resolveProvider } = createFakeProvider({ kind, chunks: ['ok'] });
		const adapter = createLlmAdapter(
			{ modelId: 'llama-3.2-3b', maxLiveSessions: 1 },
			{ resolveProvider }
		);

		const lucy = await adapter.createSession('lucy', LUCY);
		await lucy.prompt('Erste Frage');

		const max = await adapter.createSession('max', MAX);
		await max.prompt('Andere Frage');
		expect(provider.LanguageModel.destroyCount).toBe(1);

		// Lucy comes back: her handle is gone, so it must be recreated carrying her history.
		await lucy.prompt('Zweite Frage');
		expect(provider.LanguageModel.lastCreateOptions?.initialPrompts).toEqual([
			{ role: 'system', content: 'Du bist Lucy.' },
			{ role: 'user', content: 'Erste Frage' },
			{ role: 'assistant', content: 'ok' }
		]);
	});
});

/**
 * A thread keeps one session for a character's whole story, but the *scene* driving their goals
 * advances underneath it. `createSession` therefore has to re-apply its config to an existing
 * session — the bug this covers made Lucy replay the goals of scene 1 for the rest of the story,
 * so she never named Max and Sabine and the graph never left "Lucy bittet um Hilfe".
 */
describe('a scene change on an ongoing session', () => {
	const LUCY_SCENE_2: LlmSessionConfig = { systemPrompt: 'Du bist Lucy. Nenne Max und Sabine.' };

	it.each(['native', 'polyfill'] as const)(
		'rebuilds the backend handle with the new system prompt (%s)',
		async (kind) => {
			const { provider, adapter } = setup('llama-3.2-3b', { kind, chunks: ['ok'] });
			const first = await adapter.createSession('lucy', LUCY);
			await first.prompt('Wer bist du?');

			const second = await adapter.createSession('lucy', LUCY_SCENE_2);
			await second.prompt('Und jetzt?');

			// The instruction lives inside the handle, so the swap has to recreate it — and replay
			// what was already said, or the character would forget the conversation mid-scene.
			expect(provider.LanguageModel.lastCreateOptions?.initialPrompts).toEqual([
				{ role: 'system', content: 'Du bist Lucy. Nenne Max und Sabine.' },
				{ role: 'user', content: 'Wer bist du?' },
				{ role: 'assistant', content: 'ok' }
			]);
		}
	);

	it('is the same session, with its history intact', async () => {
		const { adapter } = setup('llama-3.2-3b', { kind: 'polyfill', chunks: ['ok'] });
		const first = await adapter.createSession('lucy', LUCY);
		await first.prompt('Wer bist du?');

		const second = await adapter.createSession('lucy', LUCY_SCENE_2);
		expect(second).toBe(first);
		expect(second.turns.map((t) => t.content)).toEqual(['Wer bist du?', 'ok']);
	});

	it('does not rebuild the handle when the persona is unchanged', async () => {
		const { provider, adapter } = setup('llama-3.2-3b', { kind: 'native', chunks: ['ok'] });
		const first = await adapter.createSession('lucy', LUCY);
		await first.prompt('Wer bist du?');
		const createCount = provider.LanguageModel.createCount;

		await adapter.createSession('lucy', { systemPrompt: LUCY.systemPrompt });
		await first.prompt('Und jetzt?');

		expect(provider.LanguageModel.createCount).toBe(createCount);
	});

	it('ignores seedTurns on a session that already exists', async () => {
		const { adapter } = setup('llama-3.2-3b', { kind: 'polyfill', chunks: ['ok'] });
		const first = await adapter.createSession('lucy', LUCY);
		await first.prompt('Wer bist du?');

		// Re-seeding would duplicate history the session has since extended.
		const second = await adapter.createSession('lucy', {
			...LUCY_SCENE_2,
			seedTurns: [{ role: 'user', content: 'Alte Nachricht' }]
		});
		expect(second.turns.map((t) => t.content)).toEqual(['Wer bist du?', 'ok']);
	});
});

describe('abort and failure handling', () => {
	it('rejects before generating when already aborted', async () => {
		const { provider, adapter } = setup('llama-3.2-3b');
		const session = await adapter.createSession('lucy', LUCY);
		const controller = new AbortController();
		controller.abort();

		await expect(collect(session.stream('Hallo?', { signal: controller.signal }))).rejects.toThrow(
			/abort/i
		);
		expect(provider.LanguageModel.calls).toHaveLength(0);
	});

	it('surfaces a mid-stream failure as an LlmError carrying the partial text', async () => {
		const { adapter } = setup('llama-3.2-3b', {
			chunks: ['Ich ', 'war '],
			failStreamAfter: 1
		});
		const session = await adapter.createSession('lucy', LUCY);

		const error = await collect(session.stream('Wo warst du?')).catch((e: unknown) => e);
		expect(isLlmError(error)).toBe(true);
		expect(error).toMatchObject({ code: 'compile-failed', partial: 'Ich ' });
	});

	it('does not record a turn that never finished', async () => {
		const { adapter } = setup('llama-3.2-3b', { chunks: ['Ich '], failStreamAfter: 0 });
		const session = await adapter.createSession('lucy', LUCY);
		await collect(session.stream('Wo warst du?')).catch(() => undefined);
		expect(session.turns).toEqual([]);
	});

	it('discards the interrupted handle so the next turn starts clean', async () => {
		const { provider, adapter } = setup('llama-3.2-3b', {
			chunks: ['x'],
			failStreamAfter: 0
		});
		const session = await adapter.createSession('lucy', LUCY);
		await adapter.load();
		// The warm-up handle from load() was already created and torn down (it doesn't occupy a slot).
		expect(provider.LanguageModel.createCount).toBe(1);
		expect(provider.LanguageModel.destroyCount).toBe(1);

		await collect(session.stream('Wo warst du?')).catch(() => undefined);
		// The failed turn's own handle — a second one, distinct from the warm-up handle — gets
		// discarded too.
		expect(provider.LanguageModel.createCount).toBe(2);
		expect(provider.LanguageModel.destroyCount).toBe(2);
	});
});

describe('lifecycle', () => {
	it('returns the same session object for the same key', async () => {
		const { adapter } = setup('llama-3.2-3b');
		const first = await adapter.createSession('lucy', LUCY);
		const second = await adapter.createSession('lucy', MAX);
		expect(second).toBe(first);
	});

	it('seeds a session with prior turns', async () => {
		const { adapter } = setup('llama-3.2-3b');
		const session = await adapter.createSession('lucy', {
			systemPrompt: 'Du bist Lucy.',
			seedTurns: [{ role: 'user', content: 'früher' }]
		});
		expect(session.turns).toEqual([{ role: 'user', content: 'früher' }]);
	});

	it('destroys every handle on dispose', async () => {
		const { provider, adapter } = setup('llama-3.2-3b', { kind: 'polyfill' });
		const session = await adapter.createSession('lucy', LUCY);
		await session.prompt('Hallo?');
		await adapter.dispose();
		expect(provider.LanguageModel.liveSessions).toBe(0);
	});

	it('re-resolves the provider after dispose, so a model switch takes effect', async () => {
		const { provider, adapter } = setup('llama-3.2-3b');
		await adapter.load();
		await adapter.dispose();
		await adapter.load();
		expect(provider.resolvedFor).toEqual(['llama-3.2-3b', 'llama-3.2-3b']);
	});

	it('exposes the model it was configured with, and nothing about the backend', async () => {
		const { adapter } = setup('llama-3.2-1b');
		expect(adapter.modelId).toBe('llama-3.2-1b');
		expect(Object.keys(adapter).sort()).toEqual(
			['availability', 'createSession', 'dispose', 'load', 'modelId'].sort()
		);
	});
});

describe('history windowing', () => {
	it('trims replayed history to the configured window', async () => {
		const { provider, resolveProvider } = createFakeProvider({ kind: 'native', chunks: ['ok'] });
		const adapter = createLlmAdapter(
			{ modelId: 'llama-3.2-3b', maxLiveSessions: 1 },
			{ resolveProvider }
		);

		const lucy = await adapter.createSession('lucy', { systemPrompt: 'L', maxHistoryTurns: 2 });
		await lucy.prompt('eins');
		await lucy.prompt('zwei');

		// Evict Lucy, then bring her back so her history is replayed through the window.
		const max = await adapter.createSession('max', MAX);
		await max.prompt('anders');
		await lucy.prompt('drei');

		const replayed = provider.LanguageModel.lastCreateOptions?.initialPrompts ?? [];
		expect(replayed).toEqual([
			{ role: 'system', content: 'L' },
			{ role: 'user', content: 'zwei' },
			{ role: 'assistant', content: 'ok' }
		]);
	});
});

describe('catalog coupling', () => {
	it('never exposes an MLC model id through the adapter surface', async () => {
		const { adapter } = setup('llama-3.2-3b');
		const session = await adapter.createSession('lucy', LUCY);
		const surface = JSON.stringify({
			modelId: adapter.modelId,
			sessionModelId: session.modelId,
			key: session.key
		});
		for (const model of Object.values(LLM_MODELS)) {
			expect(surface).not.toContain(model.mlcModelId);
		}
	});

	it('does not touch the network by itself', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		try {
			const { adapter } = setup('llama-3.2-3b');
			const session = await adapter.createSession('lucy', LUCY);
			await session.prompt('Hallo?');
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
