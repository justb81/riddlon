import { describe, expect, it } from 'vitest';
import { compareSemver, parseSemver } from './semver.js';

describe('parseSemver', () => {
	it('parses a well-formed x.y.z string', () => {
		expect(parseSemver('1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 });
	});

	it('rejects pre-release/build metadata and malformed strings', () => {
		expect(parseSemver('1.0.0-beta')).toBeUndefined();
		expect(parseSemver('1.0')).toBeUndefined();
		expect(parseSemver('not-a-version')).toBeUndefined();
	});
});

describe('compareSemver', () => {
	it('orders by major, then minor, then patch', () => {
		expect(compareSemver({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(
			-1
		);
		expect(compareSemver({ major: 1, minor: 2, patch: 0 }, { major: 1, minor: 1, patch: 0 })).toBe(
			1
		);
		expect(compareSemver({ major: 1, minor: 0, patch: 3 }, { major: 1, minor: 0, patch: 3 })).toBe(
			0
		);
	});
});
