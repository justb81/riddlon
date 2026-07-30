import { describe, expect, it } from 'vitest';
import { formatPackageSize, parseBundledStories } from './library.js';

describe('formatPackageSize', () => {
	it('reports a kilobyte-sized package in KB', () => {
		// `llm/catalog.ts`'s model-sized formatter rounds this to "0 MB", which is what the
		// library card used to show for an 8 KB story.
		expect(formatPackageSize(8250)).toBe('8 KB');
	});

	it('stays in bytes below a kilobyte', () => {
		expect(formatPackageSize(512)).toBe('512 B');
		expect(formatPackageSize(0)).toBe('0 B');
	});

	it('switches to MB and GB with a German decimal comma', () => {
		expect(formatPackageSize(5 * 1024 * 1024)).toBe('5,0 MB');
		expect(formatPackageSize(2 * 1024 * 1024 * 1024)).toBe('2,0 GB');
	});
});

describe('parseBundledStories', () => {
	const valid = {
		slug: 'lucys-portmonnaie',
		id: '7e9c1a2b-3d4e-4f5a-8b6c-9d0e1f2a3b4c',
		title: 'Lucys Portmonnaie',
		version: '1.0.0',
		zip: 'lucys-portmonnaie-v1.0.0.zip',
		bytes: 8250,
		sha256: 'abc',
		fileCount: 14
	};

	it('accepts the generated index', () => {
		expect(parseBundledStories([valid])).toEqual([valid]);
	});

	it('drops rows missing the fields the install needs', () => {
		expect(parseBundledStories([{ ...valid, zip: undefined }, valid])).toEqual([valid]);
		expect(parseBundledStories([{ ...valid, bytes: '8250' }])).toEqual([]);
	});

	it.each([
		['not an array', {}],
		['null', null],
		['a string', '[]']
	])('returns nothing for %s', (_label, value) => {
		expect(parseBundledStories(value)).toEqual([]);
	});
});
