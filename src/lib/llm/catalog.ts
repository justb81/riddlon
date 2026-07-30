/**
 * The one place a Riddlon model id maps to a concrete MLC model, its size and its context budget.
 *
 * Nothing outside `$lib/llm` may reference an MLC model id — that's what keeps "swap the model"
 * a config change rather than a code change (issue #12's first acceptance criterion).
 *
 * Model choice: the reference story is German, and Phi-3 Mini / Llama 3 8B (the placeholders in
 * docs/design/riddlon-app-mockup.dc.html) are both weak at it. Llama 3.2 3B is the small default,
 * Llama 3.1 8B the option for machines that can hold it.
 */

export type LocalModelId = 'llama-3.2-3b' | 'llama-3.1-8b';

export interface LlmModelDescriptor {
	id: LocalModelId;
	label: string;
	/** Model id inside `@mlc-ai/web-llm`'s `prebuiltAppConfig`. */
	mlcModelId: string;
	/**
	 * Roughly what the player waits for on first run — this is the number the progress bar tracks.
	 * Deliberately NOT `vramRequiredMB`: that's peak GPU memory (weights + KV cache + activations)
	 * and is the larger, unrelated figure. Seeded from the published weight sizes; correct it from a
	 * measured download if it drifts.
	 */
	approxDownloadBytes: number;
	/** From `prebuiltAppConfig`, used only to decide whether a device can run the model at all. */
	vramRequiredMB: number;
	/**
	 * Real context window. The polyfill hardcodes its `contextWindow` getter to 1e6, which is wrong
	 * for every model here, so history windowing uses this instead.
	 */
	contextWindow: number;
}

const GB = 1024 * 1024 * 1024;

export const LLM_MODELS: Record<LocalModelId, LlmModelDescriptor> = {
	'llama-3.2-3b': {
		id: 'llama-3.2-3b',
		label: 'Llama 3.2 3B',
		mlcModelId: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
		approxDownloadBytes: Math.round(1.9 * GB),
		vramRequiredMB: 2264,
		contextWindow: 4096
	},
	'llama-3.1-8b': {
		id: 'llama-3.1-8b',
		label: 'Llama 3.1 8B',
		mlcModelId: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
		approxDownloadBytes: Math.round(4.6 * GB),
		vramRequiredMB: 5001,
		contextWindow: 4096
	}
};

export const DEFAULT_MODEL_ID: LocalModelId = 'llama-3.2-3b';

/** Catalog order is the order the settings picker shows: smallest (and default) first. */
export const MODEL_ORDER: readonly LocalModelId[] = ['llama-3.2-3b', 'llama-3.1-8b'];

export function llmModelOptions(): readonly LlmModelDescriptor[] {
	return MODEL_ORDER.map((id) => LLM_MODELS[id]);
}

export function findModel(id: LocalModelId): LlmModelDescriptor {
	return LLM_MODELS[id];
}

export function isLocalModelId(value: unknown): value is LocalModelId {
	return typeof value === 'string' && value in LLM_MODELS;
}

/** German size label, e.g. `1,9 GB` — the UI is German-only (see $lib/i18n). */
export function formatSizeLabel(bytes: number): string {
	const gb = bytes / GB;
	if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} GB`;
	const mb = bytes / (1024 * 1024);
	return `${Math.round(mb)} MB`;
}
