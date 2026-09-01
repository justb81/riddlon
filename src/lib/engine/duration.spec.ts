import { describe, expect, it } from 'vitest';
import { parseIsoDurationMs } from './duration.js';

describe('parseIsoDurationMs', () => {
	it('parses the docs/arc42 §8.1.6 example, "PT2H", as exactly 2 hours', () => {
		expect(parseIsoDurationMs('PT2H')).toBe(2 * 60 * 60 * 1000);
	});

	it('parses combined date + time designators', () => {
		expect(parseIsoDurationMs('P1DT12H')).toBe(36 * 60 * 60 * 1000);
	});

	it('parses minutes and seconds', () => {
		expect(parseIsoDurationMs('PT1M30S')).toBe(90 * 1000);
	});

	it('parses years/months approximately (365d / 30d)', () => {
		expect(parseIsoDurationMs('P1Y')).toBe(365 * 24 * 60 * 60 * 1000);
		expect(parseIsoDurationMs('P1M')).toBe(30 * 24 * 60 * 60 * 1000);
	});

	it('returns undefined for a bare "P" or "PT" with no designators', () => {
		expect(parseIsoDurationMs('P')).toBeUndefined();
		expect(parseIsoDurationMs('PT')).toBeUndefined();
	});

	it('returns undefined for a malformed string', () => {
		expect(parseIsoDurationMs('2 hours')).toBeUndefined();
		expect(parseIsoDurationMs('')).toBeUndefined();
	});
});
