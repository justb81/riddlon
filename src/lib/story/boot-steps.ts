/**
 * What the splash screen says and how far its bar has moved, derived from real state.
 *
 * This used to be a fixed list of percentages played out by timers. It is now a pure mapping from
 * whatever phase the boot is actually in, so the first-run bar tracks the model download instead of
 * imitating one. The percent bands live in `$lib/llm/progress.ts`; the pacing they produce still
 * matches the design mockup's 0/22/54/81/100 rhythm.
 *
 * Still pure and Node-testable — the scheduler lives in `src/routes/+page.svelte`.
 */

import { PHASE_BUDGET, percentForModelLoad, percentForPhase } from '$lib/llm/progress.js';
import type { LlmErrorCode } from '$lib/llm/errors.js';
import { formatSizeLabel, type LlmModelDescriptor } from '$lib/llm/catalog.js';
import { STORY_META } from './lucys-portmonnaie.js';

export interface BootStep {
	percent: number;
	i18nKey: string;
	vars?: Record<string, string | number>;
}

export type BootPhase =
	/** Metered connection: ask before spending ~2 GB (see `shouldAutoStartDownload`). */
	| { kind: 'consent'; model: LlmModelDescriptor }
	| { kind: 'checking' }
	/** `fraction` is the adapter's raw 0..1 model-load progress. */
	| { kind: 'model-load'; fraction: number; model: LlmModelDescriptor }
	| { kind: 'story-install'; title?: string }
	| { kind: 'error'; code: LlmErrorCode }
	| { kind: 'done' };

/**
 * The model-load phase reports a single fraction covering both the download and the device prep, so
 * the label switches on a threshold rather than a real signal — see `PREPARE_THRESHOLD`.
 */
export function bootStepFor(phase: BootPhase): BootStep {
	switch (phase.kind) {
		case 'consent':
			return { percent: 0, i18nKey: 'boot.step.consent', vars: modelVars(phase.model) };

		case 'checking':
			return { percent: 0, i18nKey: 'boot.step.checking' };

		case 'model-load': {
			const percent = percentForModelLoad(phase.fraction);
			const inPrepare = percent >= PHASE_BUDGET.prepare.from;
			return {
				percent,
				i18nKey: inPrepare ? 'boot.step.preparingDevice' : 'boot.step.loadingModel',
				vars: inPrepare ? undefined : modelVars(phase.model)
			};
		}

		case 'story-install':
			return {
				// TODO(#10/#19): still a fixed beat — there is no real story-install progress to track
				// until the package importer and the reference package exist.
				percent: percentForPhase('storyInstall', 0.5),
				i18nKey: 'boot.step.installingStory',
				vars: { title: phase.title ?? STORY_META.title }
			};

		case 'error':
			return { percent: 0, i18nKey: `llm.error.${phase.code}` };

		case 'done':
			return { percent: 100, i18nKey: 'boot.step.done' };
	}
}

/** The warm path has nothing to download, so it stays a short scripted beat. */
export function warmBootSteps(): BootStep[] {
	return [
		{ percent: 0, i18nKey: 'boot.warmLabel' },
		{ percent: 100, i18nKey: 'boot.warmLabel' }
	];
}

export function bootStepSpanMs(): number {
	return 700;
}

function modelVars(model: LlmModelDescriptor): Record<string, string> {
	return { model: model.label, size: formatSizeLabel(model.approxDownloadBytes) };
}
