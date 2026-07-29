import { describe, expect, it } from 'vitest';
import { loadStoryBundle } from './load-package.js';
import {
	buildValidPackageFiles,
	withMissingCharacterFile
} from './__fixtures__/lucys-portmonnaie.js';

describe('loadStoryBundle', () => {
	it('assembles a StoryBundle from a valid package', () => {
		const result = loadStoryBundle(buildValidPackageFiles());
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.bundle?.manifest.title).toBe('Lucys Portmonnaie');
		expect(result.bundle?.graph.nodes).toHaveLength(3);
		expect(result.bundle?.clues).toHaveLength(1);
		expect(result.bundle?.facts).toEqual([]);
		expect(result.bundle?.secrets).toEqual([]);
	});

	it('returns errors and no bundle when the package is invalid', () => {
		const result = loadStoryBundle(withMissingCharacterFile(buildValidPackageFiles()));
		expect(result.valid).toBe(false);
		expect(result.bundle).toBeUndefined();
		expect(result.errors.length).toBeGreaterThan(0);
	});
});
