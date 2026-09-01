/**
 * The decisions `capabilities.ts` makes, separated from the browser APIs it reads them from, so they
 * can be tested in Node. Pure: no globals, no `navigator`, no WebGPU.
 */

export interface DeviceFacts {
	hasWebGpu: boolean;
	/** Largest buffer the GPU adapter will allocate, when the browser reports it. */
	maxBufferBytes: number | undefined;
}

export interface MeteredFacts {
	saveData: boolean | undefined;
	effectiveType: string | undefined;
}

/** Connection types where a ~2 GB download should be asked about rather than just started. */
const SLOW_TYPES = new Set(['slow-2g', '2g', '3g']);

/**
 * Whether to treat the connection as metered.
 *
 * `navigator.connection` is Chromium-only, so the *absence* of information counts as unmetered —
 * otherwise every Firefox and Safari user would get a consent prompt the design never asked for.
 * Callers distinguish "no information" from "not metered" by receiving `undefined` from the probe.
 */
export function isMeteredConnection(facts: MeteredFacts): boolean {
	if (facts.saveData) return true;
	return facts.effectiveType !== undefined && SLOW_TYPES.has(facts.effectiveType);
}

/**
 * Whether the first-run download may start on its own.
 *
 * The design mockup starts it immediately; we only interpose a consent step when the browser tells us
 * the connection is metered or data-saving is on.
 */
export function shouldAutoStartDownload(metered: boolean | undefined): boolean {
	return metered !== true;
}
