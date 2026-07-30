import { describe, expect, it } from 'vitest';
import { validatePackage } from '$lib/content/index.js';
import { buildReferencePackageFiles } from './reference-package.js';

describe('buildReferencePackageFiles', () => {
	it('validates against the package schema with zero errors', () => {
		const result = validatePackage(buildReferencePackageFiles());
		expect(result.errors).toEqual([]);
		expect(result.valid).toBe(true);
	});
});
