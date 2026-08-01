/**
 * Issue #69 regression guard: the director's JSON request must never share a conversation with a
 * character's.
 *
 * It used to, under the WebLLM polyfill: `personaMode: 'inline'` shared one backend handle across
 * every logical session (a second `create()` meant a full engine rebuild), so the director's request
 * arrived as the next turn of an ongoing German roleplay, with an empty system instruction — a weak
 * model just continued the roleplay instead of answering with JSON, stalling the story forever
 * (`director.ts`, `story-session.svelte.ts`). `webllm-direct.ts` replaced that shared handle with one
 * persistent engine reused across cheap *per-session* handles, so this now holds on both providers.
 * `adapter.spec.ts`'s parametrized "session pooling" suite proves the general case (Lucy/Max don't
 * bleed into each other); this file proves the specific one `story-session.svelte.ts` relies on.
 */

import { describe, expect, it } from 'vitest';
import { createLlmAdapter } from './adapter.js';
import { buildDirectorPrompt } from './director.js';
import { createFakeProvider } from './__fixtures__/fake-language-model.js';
import type { LlmSessionConfig } from './types.js';

const LUCY: LlmSessionConfig = { systemPrompt: 'Du bist Lucy. Ziele: reveal-identity-as-lucy.' };

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

describe.each(['native', 'polyfill'] as const)('the director pass (%s)', (kind) => {
	it('gets its own historyless conversation, seeded only with the JSON instruction', async () => {
		const { provider, resolveProvider } = createFakeProvider({
			kind,
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
		// Just the director's own prompt and its answer — none of Lucy's turns.
		expect(conversations[1].messages).toHaveLength(2);
		expect(conversations[1].messages[0].content).toBe(DIRECTOR_PROMPT);
	});

	it('starts a genuinely clean conversation on every verdict, since destroying it tears the handle down', async () => {
		const { provider, resolveProvider } = createFakeProvider({
			kind,
			chunks: ['{"flags": [], "clues": []}']
		});
		const adapter = createLlmAdapter({ modelId: 'llama-3.2-3b' }, { resolveProvider });

		const first = await adapter.createSession('director', DIRECTOR);
		await first.prompt(DIRECTOR_PROMPT);
		await first.destroy();

		const second = await adapter.createSession('director', DIRECTOR);
		await second.prompt(DIRECTOR_PROMPT);

		expect(provider.LanguageModel.destroyCount).toBe(1);
		expect(provider.LanguageModel.conversations).toHaveLength(2);
		expect(provider.LanguageModel.conversations[1].messages).toHaveLength(2);
	});
});
