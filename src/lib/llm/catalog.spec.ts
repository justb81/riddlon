import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MODEL_ID,
	LLM_MODELS,
	MODEL_ORDER,
	findModel,
	formatSizeLabel,
	isLocalModelId,
	llmModelOptions,
	type LocalModelId
} from './catalog.js';

describe('catalog', () => {
	it('exposes every model in MODEL_ORDER, and nothing else', () => {
		expect([...MODEL_ORDER].sort()).toEqual(Object.keys(LLM_MODELS).sort());
	});

	it('lists options in catalog order with the default first', () => {
		const options = llmModelOptions();
		expect(options.map((option) => option.id)).toEqual([...MODEL_ORDER]);
		expect(options[0].id).toBe(DEFAULT_MODEL_ID);
	});

	it('resolves the default model', () => {
		expect(findModel(DEFAULT_MODEL_ID).mlcModelId).toBe('Llama-3.2-3B-Instruct-q4f16_1-MLC');
	});

	it('gives every model a distinct MLC id and a self-consistent key', () => {
		const mlcIds = llmModelOptions().map((option) => option.mlcModelId);
		expect(new Set(mlcIds).size).toBe(mlcIds.length);
		for (const [key, model] of Object.entries(LLM_MODELS)) {
			expect(model.id).toBe(key);
		}
	});

	it('keeps download size and VRAM as separate figures', () => {
		// They measure different things (transfer vs. peak GPU memory) and must never be conflated
		// — that conflation is what made the mockup's numbers look wrong.
		for (const model of llmModelOptions()) {
			expect(model.approxDownloadBytes).toBeGreaterThan(0);
			expect(model.vramRequiredMB).toBeGreaterThan(0);
			expect(model.contextWindow).toBeGreaterThan(0);
		}
	});

	it('narrows unknown values with isLocalModelId', () => {
		expect(isLocalModelId(DEFAULT_MODEL_ID)).toBe(true);
		expect(isLocalModelId('phi-3-mini')).toBe(false);
		expect(isLocalModelId(undefined)).toBe(false);
	});

	it('formats sizes with a German decimal comma', () => {
		expect(formatSizeLabel(Math.round(1.9 * 1024 ** 3))).toBe('1,9 GB');
		expect(formatSizeLabel(Math.round(4.6 * 1024 ** 3))).toBe('4,6 GB');
	});

	it('falls back to MB below a gigabyte', () => {
		expect(formatSizeLabel(512 * 1024 * 1024)).toBe('512 MB');
	});

	it('matches the sizes the settings picker will show', () => {
		const labels = llmModelOptions().map((option) => formatSizeLabel(option.approxDownloadBytes));
		expect(labels).toEqual(['1,9 GB', '4,6 GB']);
	});

	it('pins the MLC model ids the WebLLM backend is configured with', () => {
		// A dependency bump that renames these in prebuiltAppConfig would otherwise fail at runtime,
		// in the browser, after a multi-gigabyte download.
		const pinned: Record<LocalModelId, string> = {
			'llama-3.2-3b': 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
			'llama-3.1-8b': 'Llama-3.1-8B-Instruct-q4f16_1-MLC'
		};
		for (const [id, mlcModelId] of Object.entries(pinned)) {
			expect(LLM_MODELS[id as LocalModelId].mlcModelId).toBe(mlcModelId);
		}
	});
});
