/**
 * The one place a Riddlon model id maps to a concrete MLC model, its size and its context budget.
 *
 * Nothing outside `$lib/llm` may reference an MLC model id — that's what keeps "swap the model"
 * a config change rather than a code change (issue #12's first acceptance criterion).
 *
 * Model choice: the reference story is German, and Phi-3 Mini / Llama 3 8B (the placeholders in
 * docs/design/riddlon-app-mockup.dc.html) are both weak at it. Llama 3.2 3B is the only local tier
 * and the default — never picked by the player (the settings screen's model list is read-only).
 * There used to be a 3.2 1B fallback for weaker devices; live-browser testing (issue #85) found it,
 * and every other tested sub-1GB-VRAM model, broke character or produced incoherent output. A
 * device that can't run 3B falls to the `unsupported` state (or, if configured, the Gemini
 * cloud fallback from issue #84) rather than a smaller, unusable local tier. Deliberately no 8B
 * tier either: Llama 3.2 tops out at 3B, and stepping up to the older Llama 3.1 8B for a marginal
 * quality gain isn't worth doubling the download for the rare device that can hold it but has no
 * native Prompt API.
 *
 * `vramRequiredMB` for every entry here is taken from `@mlc-ai/web-llm`'s own `prebuiltAppConfig`
 * model list, which ships exactly this figure per model — `catalog.spec.ts` asserts our copies stay
 * in sync with it so a web-llm version bump that changes these numbers fails loudly instead of
 * quietly mis-sizing the VRAM check. It isn't imported here directly: `@mlc-ai/web-llm` is a heavy,
 * WASM-adjacent dependency, and this module is imported far outside the WebLLM-only code path (e.g.
 * the settings screen, which a native-Prompt-API player never needs it for) — pulling it in here
 * would bundle it for everyone.
 */

export type LocalModelId = 'llama-3.2-3b';

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
	 * Real context window, used for history windowing (the Prompt API's own `contextWindow` getter
	 * isn't reliable across providers).
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
	}
};

export const DEFAULT_MODEL_ID: LocalModelId = 'llama-3.2-3b';

/** Catalog order is the order the settings picker shows: smallest first. */
export const MODEL_ORDER: readonly LocalModelId[] = ['llama-3.2-3b'];

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
