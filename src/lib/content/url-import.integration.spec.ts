import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipPackageFiles } from './__fixtures__/zip.js';
import { buildValidPackageFiles } from './__fixtures__/lucys-portmonnaie.js';

vi.mock('$app/environment', () => ({ browser: true }));

describe('importPackageFromUrl (real IndexedDB via fake-indexeddb)', () => {
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

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('downloads once, installs, and never re-fetches afterwards', async () => {
		const { importPackageFromUrl } = await import('./url-import.js');
		const { storyRegistry } = await import('$lib/storage/index.js');

		const bytes = zipPackageFiles(buildValidPackageFiles());
		const fetchMock = vi.fn(
			async () => new Response(new Uint8Array(bytes), { status: 200, statusText: 'OK' })
		);
		vi.stubGlobal('fetch', fetchMock);

		const result = await importPackageFromUrl('https://example.invalid/package.zip');

		expect(result.ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(await storyRegistry.list()).toHaveLength(1);
	});

	it('reports an unreachable URL / CORS failure as a distinguishable NETWORK_ERROR', async () => {
		const { importPackageFromUrl } = await import('./url-import.js');

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);

		const result = await importPackageFromUrl('https://example.invalid/package.zip');

		expect(result).toEqual({
			ok: false,
			errors: [{ code: 'NETWORK_ERROR', message: expect.any(String) }]
		});
	});

	it('reports a non-2xx response as a distinguishable INVALID_RESPONSE, separate from ZIP validation errors', async () => {
		const { importPackageFromUrl } = await import('./url-import.js');

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('not found', { status: 404, statusText: 'Not Found' }))
		);

		const result = await importPackageFromUrl('https://example.invalid/package.zip');

		expect(result).toEqual({
			ok: false,
			errors: [{ code: 'INVALID_RESPONSE', message: expect.any(String) }]
		});
	});

	it('reports a non-ZIP response body as a CORRUPT_ZIP error via the shared installer', async () => {
		const { importPackageFromUrl } = await import('./url-import.js');

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('<html>not a zip</html>', { status: 200, statusText: 'OK' }))
		);

		const result = await importPackageFromUrl('https://example.invalid/package.zip');

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors).toEqual([{ code: 'CORRUPT_ZIP', message: expect.any(String) }]);
	});
});
