/**
 * Turning the polyfill's single progress signal into something a progress bar can trust.
 *
 * The WebLLM backend collapses *both* the weight download and the shader-compile/VRAM-load into one
 * 0..1 fraction, and does not forward WebLLM's own progress `text`. So there is no real phase
 * boundary available to us — `phaseForFraction` guesses one from a threshold, and says so.
 */

import type { LlmProgress } from './types.js';

/**
 * Where each boot phase sits on the 0-100 bar. Chosen to keep the pacing of the design mockup's
 * 0/22/54/81/100 timeline, now that the first stretch is driven by a real download.
 */
export const PHASE_BUDGET = {
	download: { from: 0, to: 70 },
	prepare: { from: 70, to: 85 },
	storyInstall: { from: 85, to: 100 }
} as const;

/**
 * Above this fraction the download is treated as finished and the remaining time as device prep.
 * A heuristic, not a signal: see the module comment.
 */
export const PREPARE_THRESHOLD = 0.85;

export function phaseForFraction(fraction: number): LlmProgress['phase'] {
	return fraction >= PREPARE_THRESHOLD ? 'prepare' : 'download';
}

/** Progress bars must never run backwards, whatever the provider reports. */
export function monotonic(previous: number, next: number): number {
	return Math.max(previous, clampFraction(next));
}

export function clampFraction(value: number): number {
	if (!Number.isFinite(value)) return 0;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

/**
 * Reads the `loaded` fraction off a `downloadprogress` event.
 *
 * The polyfill dispatches a real `ProgressEvent` with `loaded` in 0..1 and `total` 1, but a native
 * implementation may well use byte counts instead, so normalise against `total` when it looks like
 * one. Returns `undefined` for an event carrying nothing usable, so callers can ignore it rather
 * than snapping the bar to 0.
 */
export function normalizeProgressEvent(event: Event): number | undefined {
	const candidate = event as Partial<ProgressEvent>;
	const loaded = typeof candidate.loaded === 'number' ? candidate.loaded : undefined;
	if (loaded === undefined || !Number.isFinite(loaded)) return undefined;

	const total = typeof candidate.total === 'number' ? candidate.total : undefined;
	if (total !== undefined && Number.isFinite(total) && total > 1) {
		return clampFraction(loaded / total);
	}
	return clampFraction(loaded);
}

/** Maps a phase-local fraction onto its slice of the overall 0-100 bar. */
export function percentForPhase(
	phase: keyof typeof PHASE_BUDGET,
	fraction: number,
	fullPhaseFraction = 1
): number {
	const { from, to } = PHASE_BUDGET[phase];
	const local = fullPhaseFraction <= 0 ? 1 : clampFraction(fraction / fullPhaseFraction);
	return Math.round(from + (to - from) * local);
}

/**
 * Where a raw 0..1 model-load fraction sits on the overall bar, spanning the download and prepare
 * bands so a single monotonic input produces a single monotonic output.
 */
export function percentForModelLoad(fraction: number): number {
	const value = clampFraction(fraction);
	if (value < PREPARE_THRESHOLD) {
		return percentForPhase('download', value, PREPARE_THRESHOLD);
	}
	return percentForPhase('prepare', value - PREPARE_THRESHOLD, 1 - PREPARE_THRESHOLD);
}
