import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MODEL_ID,
	LLM_MODELS,
	MODEL_ORDER,
	findModel,
	formatSizeLabel,
	llmModelOptions,
	type LocalModelId
} from './catalog.js';

describe('catalog', () => {
	it('exposes every model in MODEL_ORDER, and nothing else', () => {
		expect([...MODEL_ORDER].sort()).toEqual(Object.keys(LLM_MODELS).sort());
	});

	it('lists options in catalog order, smallest first', () => {
		const options = llmModelOptions();
		expect(options.map((option) => option.id)).toEqual([...MODEL_ORDER]);
		expect(MODEL_ORDER).toContain(DEFAULT_MODEL_ID);
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

	it('formats sizes with a German decimal comma', () => {
		expect(formatSizeLabel(Math.round(1.9 * 1024 ** 3))).toBe('1,9 GB');
		expect(formatSizeLabel(Math.round(4.6 * 1024 ** 3))).toBe('4,6 GB');
	});

	it('falls back to MB below a gigabyte', () => {
		expect(formatSizeLabel(512 * 1024 * 1024)).toBe('512 MB');
	});

	it('matches the sizes the settings picker will show', () => {
		const labels = llmModelOptions().map((option) => formatSizeLabel(option.approxDownloadBytes));
		expect(labels).toEqual(['1,9 GB']);
	});

	it('pins the MLC model ids the WebLLM backend is configured with', () => {
		// A dependency bump that renames these in prebuiltAppConfig would otherwise fail at runtime,
		// in the browser, after a multi-gigabyte download.
		const pinned: Record<LocalModelId, string> = {
			'llama-3.2-3b': 'Llama-3.2-3B-Instruct-q4f16_1-MLC'
		};
		for (const [id, mlcModelId] of Object.entries(pinned)) {
			expect(LLM_MODELS[id as LocalModelId].mlcModelId).toBe(mlcModelId);
		}
	});

	it("keeps vramRequiredMB in sync with web-llm's own model list", async () => {
		// web-llm ships `vram_required_MB` per model in `prebuiltAppConfig` — that's the authoritative
		// figure the VRAM check is really about, so our copy must track it. A dynamic import here is
		// fine: this is a Node-only spec, not the runtime bundle catalog.ts itself must stay out of
		// (see catalog.ts's module comment).
		const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
		for (const model of llmModelOptions()) {
			const upstream = prebuiltAppConfig.model_list.find((m) => m.model_id === model.mlcModelId);
			expect(upstream, `${model.mlcModelId} missing from prebuiltAppConfig`).toBeDefined();
			// Rounded to whole MB when we copied it in; allow for that.
			expect(model.vramRequiredMB).toBeCloseTo(upstream?.vram_required_MB ?? NaN, 0);
		}
	});
});
