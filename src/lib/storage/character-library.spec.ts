import { describe, expect, it } from 'vitest';
import { mergeCharacterLink } from './character-library.js';
import type { CharacterIdentity } from '$lib/content/index.js';
import { LUCY_ID } from '$lib/content/__fixtures__/lucys-portmonnaie.js';
import { secondPackageLucyCharacterFile } from '$lib/content/__fixtures__/second-package.js';

const originalLucy: CharacterIdentity = {
	id: LUCY_ID,
	slug: 'lucy',
	displayName: 'Lucy',
	originPackage: '7e9c1a2b-3d4e-4f5a-8b6c-9d0e1f2a3b4c',
	shareable: true
};

describe('mergeCharacterLink', () => {
	it('creates a new record with a single link when the character is unknown', () => {
		const record = mergeCharacterLink(undefined, originalLucy, 'package-a');
		expect(record).toEqual({ ...originalLucy, linkedPackageIds: ['package-a'] });
	});

	it('links a second package without duplicating the identity, keeping first-write-wins identity fields', () => {
		const first = mergeCharacterLink(undefined, originalLucy, 'package-a');
		const reAuthoredLucy = secondPackageLucyCharacterFile();
		const merged = mergeCharacterLink(first, reAuthoredLucy, 'package-b');

		expect(merged.linkedPackageIds).toEqual(['package-a', 'package-b']);
		// identity fields stay the first-installed package's copy, not the re-authored one
		expect(merged.voiceStyle).toBe(originalLucy.voiceStyle);
		expect(merged.originPackage).toBe(originalLucy.originPackage);
	});

	it('is idempotent when the same package installs/links again', () => {
		const first = mergeCharacterLink(undefined, originalLucy, 'package-a');
		const again = mergeCharacterLink(first, originalLucy, 'package-a');
		expect(again.linkedPackageIds).toEqual(['package-a']);
	});
});
