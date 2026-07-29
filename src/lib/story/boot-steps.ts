/** Pure boot-sequence timeline for the splash screen — see boot.svelte.ts for the scheduler. */

import { MODEL_OPTIONS } from '$lib/state/profile.js';
import { STORY_META } from './lucys-portmonnaie.js';

export interface BootStep {
	percent: number;
	i18nKey: string;
	vars?: Record<string, string | number>;
}

/**
 * First run installs the local model + reference story (mirrors docs/concept.md §4.2);
 * every later run just re-warms whatever's already installed, so it's a much shorter beat.
 */
export function bootSteps(firstRun: boolean): BootStep[] {
	if (!firstRun) {
		return [
			{ percent: 0, i18nKey: 'boot.warmLabel' },
			{ percent: 100, i18nKey: 'boot.warmLabel' }
		];
	}
	const model = MODEL_OPTIONS[0];
	return [
		{
			percent: 0,
			i18nKey: 'boot.step.loadingModel',
			vars: { model: model.label, size: model.sizeLabel }
		},
		{
			percent: 22,
			i18nKey: 'boot.step.loadingModel',
			vars: { model: model.label, size: model.sizeLabel }
		},
		{ percent: 54, i18nKey: 'boot.step.preparingDevice' },
		{ percent: 81, i18nKey: 'boot.step.installingStory', vars: { title: STORY_META.title } },
		{ percent: 100, i18nKey: 'boot.step.done' }
	];
}

export function bootStepSpanMs(firstRun: boolean): number {
	return firstRun ? 900 : 700;
}
