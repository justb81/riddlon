import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { zipPackageFiles } from './__fixtures__/zip.js';
import { buildValidPackageFiles } from './__fixtures__/lucys-portmonnaie.js';

vi.mock('$app/environment', () => ({ browser: true }));

describe('importPackageFromZipFile (real IndexedDB via fake-indexeddb)', () => {
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

	it('reads a File (as selected via a file picker) and installs it', async () => {
		const { importPackageFromZipFile } = await import('./zip-import.js');
		const { storyRegistry } = await import('$lib/storage/index.js');

		const bytes = zipPackageFiles(buildValidPackageFiles());
		const file = new File([new Uint8Array(bytes)], 'lucys-portmonnaie.zip', {
			type: 'application/zip'
		});

		const result = await importPackageFromZipFile(file);

		expect(result.ok).toBe(true);
		expect(await storyRegistry.list()).toHaveLength(1);
	});
});
