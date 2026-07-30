import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { unzipPackage } from './unzip.js';
import { zipPackageFiles } from './__fixtures__/zip.js';
import { buildValidPackageFiles } from './__fixtures__/lucys-portmonnaie.js';

describe('unzipPackage', () => {
	it('splits a well-formed archive into parsed JSON files and raw asset bytes', () => {
		const avatar = new Uint8Array([1, 2, 3, 4]);
		const bytes = zipPackageFiles(buildValidPackageFiles(), { 'assets/avatars/lucy.png': avatar });

		const result = unzipPackage(bytes);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.jsonFiles['manifest.json']).toMatchObject({ title: 'Lucys Portmonnaie' });
		expect(result.value.assetFiles['assets/avatars/lucy.png']).toEqual(avatar);
		expect(result.value.jsonFiles['assets/avatars/lucy.png']).toBeUndefined();
	});

	it('reports a corrupt archive as a distinguishable CORRUPT_ZIP error, not a thrown exception', () => {
		const result = unzipPackage(new Uint8Array([1, 2, 3, 4, 5]));
		expect(result).toEqual({
			ok: false,
			error: { code: 'CORRUPT_ZIP', message: expect.any(String) }
		});
	});

	it('reports a .json entry containing invalid JSON as INVALID_JSON, naming the offending path', () => {
		const encoder = new TextEncoder();
		const broken = zipSync({ 'manifest.json': encoder.encode('{ not valid json') });

		const result = unzipPackage(broken);
		expect(result).toEqual({
			ok: false,
			error: { code: 'INVALID_JSON', path: 'manifest.json', message: expect.any(String) }
		});
	});
});
