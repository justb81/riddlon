import { describe, expect, it } from 'vitest';
import { isoDurationSchema, semverSchema, symbolicRefSchema, uuidV4Schema } from './common.js';

describe('uuidV4Schema', () => {
	it('accepts a well-formed UUIDv4', () => {
		expect(uuidV4Schema.safeParse('3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f').success).toBe(true);
	});

	it('rejects a slug or non-UUID string', () => {
		expect(uuidV4Schema.safeParse('lucy').success).toBe(false);
		expect(uuidV4Schema.safeParse('3f2a1c9e-7b41-1e3a-9c2d-1a2b3c4d5e6f').success).toBe(false); // wrong version nibble
	});
});

describe('symbolicRefSchema', () => {
	it('accepts colon-segmented content tags', () => {
		expect(symbolicRefSchema.safeParse('clue:time-window').success).toBe(true);
		expect(symbolicRefSchema.safeParse('flag:max-contact-unlocked').success).toBe(true);
	});

	it('rejects empty strings', () => {
		expect(symbolicRefSchema.safeParse('').success).toBe(false);
	});
});

describe('semverSchema', () => {
	it('accepts x.y.z and rejects anything else', () => {
		expect(semverSchema.safeParse('1.0.0').success).toBe(true);
		expect(semverSchema.safeParse('v1.0.0').success).toBe(false);
	});
});

describe('isoDurationSchema', () => {
	it('accepts the doc example "PT2H"', () => {
		expect(isoDurationSchema.safeParse('PT2H').success).toBe(true);
	});

	it('rejects a bare "P" with no designators', () => {
		expect(isoDurationSchema.safeParse('P').success).toBe(false);
	});
});
