import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { zipPackageFiles } from './__fixtures__/zip.js';
import {
	buildValidPackageFiles,
	LUCY_ID,
	MAX_ID,
	SABINE_ID,
	withIncompatibleMinPlayerVersion,
	withMissingCharacterFile
} from './__fixtures__/lucys-portmonnaie.js';

vi.mock('$app/environment', () => ({ browser: true }));

describe('installPackageFromZipBytes (real IndexedDB via fake-indexeddb)', () => {
	beforeEach(async () => {
		const { resetDbConnectionForTests, DB_NAME } = await import('$lib/storage/db.js');
		await resetDbConnectionForTests();
		await new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase(DB_NAME);
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});
	});

	it('installs a valid ZIP: registers the package and links its characters', async () => {
		const { installPackageFromZipBytes } = await import('./install-package.js');
		const { storyRegistry, characterLibrary } = await import('$lib/storage/index.js');

		const bytes = zipPackageFiles(buildValidPackageFiles());
		const result = await installPackageFromZipBytes(bytes);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.summary.title).toBe('Lucys Portmonnaie');
		expect(result.summary.characterIds.sort()).toEqual([LUCY_ID, MAX_ID, SABINE_ID].sort());
		expect(result.summary.sizeBytes).toBe(bytes.byteLength);

		const installed = await storyRegistry.list();
		expect(installed.map((p) => p.id)).toEqual([result.summary.id]);

		const lucy = await characterLibrary.getById(LUCY_ID);
		expect(lucy?.linkedPackageIds).toEqual([result.summary.id]);
	});

	it('rejects a corrupt ZIP with a distinguishable CORRUPT_ZIP error and installs nothing', async () => {
		const { installPackageFromZipBytes } = await import('./install-package.js');
		const { storyRegistry } = await import('$lib/storage/index.js');

		const result = await installPackageFromZipBytes(new Uint8Array([9, 9, 9, 9]));

		expect(result).toEqual({
			ok: false,
			errors: [{ code: 'CORRUPT_ZIP', message: expect.any(String) }]
		});
		expect(await storyRegistry.list()).toEqual([]);
	});

	it('rejects a package missing a manifest-referenced file with a distinguishable MISSING_FILE error', async () => {
		const { installPackageFromZipBytes } = await import('./install-package.js');
		const { storyRegistry } = await import('$lib/storage/index.js');

		const bytes = zipPackageFiles(withMissingCharacterFile(buildValidPackageFiles()));
		const result = await installPackageFromZipBytes(bytes);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors).toContainEqual(expect.objectContaining({ code: 'MISSING_FILE' }));
		expect(await storyRegistry.list()).toEqual([]);
	});

	it('rejects a package whose minPlayerVersion exceeds the running player with a distinguishable PLAYER_TOO_OLD error', async () => {
		const { installPackageFromZipBytes } = await import('./install-package.js');
		const { storyRegistry } = await import('$lib/storage/index.js');

		const bytes = zipPackageFiles(withIncompatibleMinPlayerVersion(buildValidPackageFiles()));
		const result = await installPackageFromZipBytes(bytes);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors).toContainEqual(expect.objectContaining({ code: 'PLAYER_TOO_OLD' }));
		expect(await storyRegistry.list()).toEqual([]);
	});
});
