import { describe, expect, it, vi } from 'vitest';

/**
 * `webllm-direct.ts` only reaches `@mlc-ai/web-llm` through a dynamic import, so a module mock is
 * enough to see the exact request it builds — no WebGPU needed.
 */
const create = vi.fn(async () =>
	(async function* () {
		yield { choices: [{ delta: { content: '{}' } }] };
	})()
);

vi.mock('@mlc-ai/web-llm', () => ({
	prebuiltAppConfig: {},
	CreateMLCEngine: async () => ({
		chat: { completions: { create } },
		interruptGenerate: async () => undefined,
		unload: async () => undefined
	})
}));

const { createWebLlmLanguageModel } = await import('./webllm-direct.js');

describe('response schema', () => {
	it('passes a schema to XGrammar as a json_object response_format string', async () => {
		const session = await createWebLlmLanguageModel('test-model').create({ temperature: 0 });
		const schema = { type: 'object' };
		expect(await session.prompt('Urteil?', { responseConstraint: schema })).toBe('{}');
		await session.prompt('Noch eins?');

		expect(create.mock.calls.map((call) => (call as unknown[])[0])).toMatchObject([
			{ temperature: 0, response_format: { type: 'json_object', schema: JSON.stringify(schema) } },
			{ temperature: 0, response_format: undefined }
		]);
	});
});
