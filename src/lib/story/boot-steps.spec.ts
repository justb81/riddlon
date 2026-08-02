import { describe, expect, it } from 'vitest';
import { PHASE_BUDGET } from '$lib/llm/progress.js';
import { DEFAULT_MODEL_ID, findModel } from '$lib/llm/catalog.js';
import { bootStepFor, bootStepSpanMs, warmBootSteps, type BootPhase } from './boot-steps.js';

const MODEL = findModel(DEFAULT_MODEL_ID);

describe('warmBootSteps', () => {
	it('runs a short two-beat sequence on a warm start', () => {
		const steps = warmBootSteps();
		expect(steps.map((s) => s.percent)).toEqual([0, 100]);
		expect(steps.every((s) => s.i18nKey === 'boot.warmLabel')).toBe(true);
	});
});

describe('bootStepSpanMs', () => {
	it('paces the warm beats at a sane speed', () => {
		// It no longer takes a `firstRun` argument: the first run is paced by the real download now,
		// not by a timer, so there is nothing left to compare against.
		expect(bootStepSpanMs()).toBeGreaterThan(0);
	});
});

describe('bootStepFor', () => {
	it('asks for consent before spending a multi-gigabyte download', () => {
		const step = bootStepFor({ kind: 'consent', model: MODEL });
		expect(step).toMatchObject({ percent: 0, i18nKey: 'boot.step.consent' });
		expect(step.vars).toEqual({ model: 'Llama 3.2 3B', size: '1,9 GB' });
	});

	it('labels the capability probe', () => {
		expect(bootStepFor({ kind: 'checking' })).toEqual({
			percent: 0,
			i18nKey: 'boot.step.checking'
		});
	});

	it('names the model and its download size while loading', () => {
		const step = bootStepFor({ kind: 'model-load', fraction: 0.2, model: MODEL });
		expect(step.i18nKey).toBe('boot.step.loadingModel');
		expect(step.vars).toEqual({ model: 'Llama 3.2 3B', size: '1,9 GB' });
	});

	it('keeps the whole model load inside its band', () => {
		for (const fraction of [0, 0.25, 0.5, 0.99, 1]) {
			const { percent } = bootStepFor({ kind: 'model-load', fraction, model: MODEL });
			expect(percent).toBeGreaterThanOrEqual(PHASE_BUDGET.download.from);
			expect(percent).toBeLessThanOrEqual(PHASE_BUDGET.prepare.to);
		}
	});

	it('switches to device preparation for the tail of the load', () => {
		const early = bootStepFor({ kind: 'model-load', fraction: 0.3, model: MODEL });
		const late = bootStepFor({ kind: 'model-load', fraction: 0.95, model: MODEL });
		expect(early.i18nKey).toBe('boot.step.loadingModel');
		expect(late.i18nKey).toBe('boot.step.preparingDevice');
		// The prep label is about the device, not the model, so it carries no interpolation.
		expect(late.vars).toBeUndefined();
	});

	it('reports the library read without naming a story', () => {
		// Nothing is auto-installed any more, so this phase is a local read — there is no story
		// title to interpolate, and inventing one is exactly what this replaced.
		const step = bootStepFor({ kind: 'library-load' });
		expect(step.i18nKey).toBe('boot.step.loadingLibrary');
		expect(step.vars).toBeUndefined();
	});

	it('ends at exactly 100 %', () => {
		expect(bootStepFor({ kind: 'done' })).toEqual({ percent: 100, i18nKey: 'boot.step.done' });
	});

	it('maps a failure onto its own message rather than a bare percentage', () => {
		expect(bootStepFor({ kind: 'error', code: 'no-webgpu' }).i18nKey).toBe('llm.error.no-webgpu');
		expect(bootStepFor({ kind: 'error', code: 'offline' }).i18nKey).toBe('llm.error.offline');
	});

	it('never runs backwards across the canonical boot sequence', () => {
		const sequence: BootPhase[] = [
			{ kind: 'checking' },
			{ kind: 'model-load', fraction: 0, model: MODEL },
			{ kind: 'model-load', fraction: 0.3, model: MODEL },
			{ kind: 'model-load', fraction: 0.85, model: MODEL },
			{ kind: 'model-load', fraction: 1, model: MODEL },
			{ kind: 'library-load' },
			{ kind: 'done' }
		];

		let previous = -1;
		for (const phase of sequence) {
			const { percent } = bootStepFor(phase);
			expect(percent).toBeGreaterThanOrEqual(previous);
			previous = percent;
		}
		expect(previous).toBe(100);
	});

	it('is monotonic under a jittery progress feed', () => {
		// The WebLLM backend forces monotonicity within one session, but a rebuilt session restarts
		// its fraction — the mapper must not be what lets the bar jump around.
		const fractions = [0, 0.1, 0.1, 0.4, 0.55, 0.84, 0.86, 0.99, 1];
		let previous = -1;
		for (const fraction of fractions) {
			const { percent } = bootStepFor({ kind: 'model-load', fraction, model: MODEL });
			expect(percent).toBeGreaterThanOrEqual(previous);
			previous = percent;
		}
	});
});
