import { describe, expect, it } from 'vitest';
import { createProgressEvent } from './__fixtures__/progress-event.js';
import {
	PHASE_BUDGET,
	PREPARE_THRESHOLD,
	clampFraction,
	monotonic,
	normalizeProgressEvent,
	percentForModelLoad,
	percentForPhase,
	phaseForFraction
} from './progress.js';

describe('clampFraction', () => {
	it('clamps out-of-range values into 0..1', () => {
		expect(clampFraction(-0.5)).toBe(0);
		expect(clampFraction(1.5)).toBe(1);
		expect(clampFraction(0.42)).toBe(0.42);
	});

	it('treats NaN as the start, and infinities as their natural clamp', () => {
		expect(clampFraction(Number.NaN)).toBe(0);
		expect(clampFraction(Number.POSITIVE_INFINITY)).toBe(1);
		expect(clampFraction(Number.NEGATIVE_INFINITY)).toBe(0);
	});
});

describe('monotonic', () => {
	it('never lets progress run backwards', () => {
		expect(monotonic(0.6, 0.3)).toBe(0.6);
		expect(monotonic(0.6, 0.9)).toBe(0.9);
	});

	it('survives a jittery provider without ever decreasing', () => {
		const reported = [0, 0.2, 0.15, 0.4, 0.4, 0.39, 0.8, 0.5, 1, 0.9];
		let current = 0;
		const seen: number[] = [];
		for (const value of reported) {
			current = monotonic(current, value);
			seen.push(current);
		}
		expect(seen).toEqual([0, 0.2, 0.2, 0.4, 0.4, 0.4, 0.8, 0.8, 1, 1]);
	});
});

describe('phaseForFraction', () => {
	it('flips from download to prepare at the threshold', () => {
		expect(phaseForFraction(PREPARE_THRESHOLD - 0.01)).toBe('download');
		expect(phaseForFraction(PREPARE_THRESHOLD)).toBe('prepare');
		expect(phaseForFraction(1)).toBe('prepare');
	});
});

describe('normalizeProgressEvent', () => {
	it('reads a 0..1 loaded fraction as-is', () => {
		const event = createProgressEvent('downloadprogress', { loaded: 0.25, total: 1 });
		expect(normalizeProgressEvent(event)).toBe(0.25);
	});

	it('divides byte counts by their total', () => {
		const event = createProgressEvent('downloadprogress', { loaded: 512, total: 2048 });
		expect(normalizeProgressEvent(event)).toBe(0.25);
	});

	it('ignores an event carrying nothing usable', () => {
		expect(normalizeProgressEvent(new Event('downloadprogress'))).toBeUndefined();
	});
});

describe('percentForPhase', () => {
	it('maps a phase-local fraction onto that phase band', () => {
		expect(percentForPhase('download', 0)).toBe(PHASE_BUDGET.download.from);
		expect(percentForPhase('download', 1)).toBe(PHASE_BUDGET.download.to);
		expect(percentForPhase('storyInstall', 1)).toBe(100);
	});
});

describe('percentForModelLoad', () => {
	it('spans the download and prepare bands', () => {
		expect(percentForModelLoad(0)).toBe(PHASE_BUDGET.download.from);
		expect(percentForModelLoad(PREPARE_THRESHOLD)).toBe(PHASE_BUDGET.prepare.from);
		expect(percentForModelLoad(1)).toBe(PHASE_BUDGET.prepare.to);
	});

	it('is non-decreasing across the whole range', () => {
		let previous = -1;
		for (let i = 0; i <= 100; i += 1) {
			const percent = percentForModelLoad(i / 100);
			expect(percent).toBeGreaterThanOrEqual(previous);
			previous = percent;
		}
	});

	it('never exceeds the model-load budget, leaving room for the story install', () => {
		expect(percentForModelLoad(1)).toBeLessThan(100);
	});
});
