/**
 * What the *backend* really receives under the polyfill's shared handle.
 *
 * Everything else in `adapter.spec.ts` asserts what the adapter *sends*. That is not the same
 * thing, because a backend handle is stateful: the polyfill appends every prompt and every answer
 * to the handle's own conversation and prepends that whole history to the next generation
 * (`prompt-api-polyfill`'s `promptStreaming` → `generateContentStream([...#t, next])`). In
 * `personaMode: 'inline'` — which is what the polyfill always gets, because a second `create()`
 * rebuilds the whole MLCEngine — *one* handle is shared by every logical session, so that one
 * conversation holds every character's turns **and** the director's.
 *
 * These tests exist because that is the mechanism behind "the director never sets a flag, so the
 * story never advances": its JSON request is not a fresh, historyless call at all, it is turn N of
 * an ongoing German roleplay whose system instruction is empty. They assert current behaviour so
 * the effect is written down and a fix has something to change; each one names what it implies.
 */

import { describe, expect, it } from 'vitest';
import { createLlmAdapter } from './adapter.js';
import { buildDirectorPrompt } from './director.js';
import { createFakeProvider } from './__fixtures__/fake-language-model.js';
import type { LlmSessionConfig } from './types.js';

const LUCY: LlmSessionConfig = { systemPrompt: 'Du bist Lucy. Ziele: reveal-identity-as-lucy.' };
const MAX: LlmSessionConfig = { systemPrompt: 'Du bist Max.' };

/** What `story-session.svelte.ts` creates for its director pass, verbatim. */
const DIRECTOR: LlmSessionConfig = {
	systemPrompt: 'Du antwortest ausschließlich mit JSON.',
	maxHistoryTurns: 0
};

const DIRECTOR_PROMPT = buildDirectorPrompt({
	scene: {
		goals: ['reveal-identity-as-lucy'],
		exitConditions: ['flag:lucy-identified'],
		revealables: []
	},
	clues: [],
	characters: [{ id: 'lucy-id', name: 'Lucy' }],
	turns: [
		{ who: 'Lucy', text: 'Ich bin Lucy.' },
		{ who: 'Du', text: 'Hi, wer bist du denn?' }
	]
});

function setup(chunks: readonly string[]) {
	const { provider, resolveProvider } = createFakeProvider({ kind: 'polyfill', chunks });
	return { provider, adapter: createLlmAdapter({ modelId: 'llama-3.2-3b' }, { resolveProvider }) };
}

describe('the one conversation every inline session shares', () => {
	it('is created without a system instruction, so no session ever gets one', async () => {
		const { provider, adapter } = setup(['Hallo.']);
		const lucy = await adapter.createSession('lucy', LUCY);
		await lucy.prompt('Wer bist du?');

		// Implication: `LlmSessionConfig.systemPrompt` reaches the model only as ordinary text
		// inside a user message — never as a system role the backend weights differently.
		expect(provider.LanguageModel.conversations).toHaveLength(1);
		expect(provider.LanguageModel.conversations[0].seeded).toEqual([]);
	});

	it('keeps every earlier turn, on top of the history the adapter renders into each prompt', async () => {
		const { provider, adapter } = setup(['Ich bin Lucy.']);
		const lucy = await adapter.createSession('lucy', LUCY);
		await lucy.prompt('Wer bist du?');
		await lucy.prompt('Und was ist passiert?');

		const { messages } = provider.LanguageModel.conversations[0];
		expect(messages).toHaveLength(4);
		// Turn 2 renders persona + turn 1 into its input *and* the handle still holds turn 1, so
		// the model sees the same exchange twice — and the persona once per turn, forever.
		expect(messages[2].content).toContain('Wer bist du?');
		expect(messages[0].content).toContain('Wer bist du?');
		expect(messages.filter((m) => m.content.includes('Du bist Lucy.'))).toHaveLength(2);
	});

	it('mixes characters: Max answers with Lucy’s turns already in the context', async () => {
		const { provider, adapter } = setup(['Ja.']);
		const lucy = await adapter.createSession('lucy', LUCY);
		await lucy.prompt('Wer bist du?');
		const max = await adapter.createSession('max', MAX);
		await max.prompt('Warst du im Club?');

		expect(provider.LanguageModel.conversations).toHaveLength(1);
		const { messages } = provider.LanguageModel.conversations[0];
		expect(messages[2].content).toContain('Du bist Max.');
		expect(messages[0].content).toContain('Du bist Lucy.');
	});
});

describe('the director pass in that conversation', () => {
	it('asks for JSON as the next turn of the roleplay it is supposed to judge', async () => {
		const { provider, adapter } = setup(['Ich bin Lucy.']);
		const lucy = await adapter.createSession('lucy', LUCY);
		await lucy.prompt('Wer bist du?');

		const director = await adapter.createSession('director', DIRECTOR);
		await director.prompt(DIRECTOR_PROMPT);

		const { messages } = provider.LanguageModel.conversations[0];
		// Implication: `maxHistoryTurns: 0` empties only *our* record of the director's history.
		// The backend still starts from Lucy's turns, with the last assistant message being her
		// prose — which is what a 3B model continues instead of emitting `{"flags": […]}`.
		expect(messages.at(-2)?.content).toContain('flag:lucy-identified');
		expect(
			messages
				.slice(0, 2)
				.map((m) => m.content)
				.join('\n')
		).toContain('Du bist Lucy.');
		expect(messages[1].content).toBe('Ich bin Lucy.');
	});

	it('leaves its turns behind when destroyed, so each verdict is judged after the last one', async () => {
		const { provider, adapter } = setup(['{"flags": [], "clues": []}']);
		const first = await adapter.createSession('director', DIRECTOR);
		await first.prompt(DIRECTOR_PROMPT);
		await first.destroy();

		const second = await adapter.createSession('director', DIRECTOR);
		await second.prompt(DIRECTOR_PROMPT);

		// Implication: destroying the logical session cannot reset the shared handle — only a
		// second `create()` could, and under the polyfill that is a full model reload.
		expect(provider.LanguageModel.destroyCount).toBe(0);
		expect(provider.LanguageModel.conversations).toHaveLength(1);
		expect(provider.LanguageModel.conversations[0].messages).toHaveLength(4);
	});

	it('does get a clean, historyless conversation on a native provider', async () => {
		// The same code path is correct where a session is cheap: `personaMode: 'session'` gives the
		// director its own handle, seeded with its own system instruction and nothing else. So this
		// is a polyfill problem, not a director-prompt problem.
		const { provider, resolveProvider } = createFakeProvider({
			kind: 'native',
			chunks: ['{"flags": ["flag:lucy-identified"], "clues": []}']
		});
		const adapter = createLlmAdapter({ modelId: 'llama-3.2-3b' }, { resolveProvider });

		const lucy = await adapter.createSession('lucy', LUCY);
		await lucy.prompt('Wer bist du?');
		const director = await adapter.createSession('director', DIRECTOR);
		await director.prompt(DIRECTOR_PROMPT);

		const conversations = provider.LanguageModel.conversations;
		expect(conversations).toHaveLength(2);
		expect(conversations[1].seeded).toEqual([{ role: 'system', content: DIRECTOR.systemPrompt }]);
		expect(conversations[1].messages).toHaveLength(2);
	});
});
