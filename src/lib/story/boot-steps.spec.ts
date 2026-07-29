import { describe, expect, it } from 'vitest';
import { bootSteps, bootStepSpanMs } from './boot-steps.js';

describe('bootSteps', () => {
	it('runs a short two-beat sequence on a warm start', () => {
		const steps = bootSteps(false);
		expect(steps.map((s) => s.percent)).toEqual([0, 100]);
		expect(steps.every((s) => s.i18nKey === 'boot.warmLabel')).toBe(true);
	});

	it('runs the full install sequence on first run, ending at 100%', () => {
		const steps = bootSteps(true);
		expect(steps.at(0)?.percent).toBe(0);
		expect(steps.at(-1)).toEqual({ percent: 100, i18nKey: 'boot.step.done' });
		expect(steps.some((s) => s.i18nKey === 'boot.step.installingStory')).toBe(true);
	});
});

describe('bootStepSpanMs', () => {
	it('paces the first run slower than a warm restart', () => {
		expect(bootStepSpanMs(true)).toBeGreaterThan(bootStepSpanMs(false));
	});
});
