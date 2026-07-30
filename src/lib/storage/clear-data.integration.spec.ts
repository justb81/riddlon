import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Manifest } from '$lib/content/index.js';

vi.mock('$app/environment', () => ({ browser: true }));

// Node has no Cache Storage API (see CLAUDE.md, "Manual browser testing"), so the asset side of
// `clearAllStoredData` is stubbed here — what this spec is about is the IndexedDB wipe. That the
// real Cache is emptied is verified by hand in a browser.
const deletedCaches: string[] = [];
vi.stubGlobal('caches', {
	delete: async (name: string) => {
		deletedCaches.push(name);
		return true;
	}
});

describe('clearSaves / clearAllStoredData (real IndexedDB via fake-indexeddb)', () => {
	let manifest: Manifest;

	beforeEach(async () => {
		deletedCaches.length = 0;
		const { resetDbConnectionForTests, DB_NAME } = await import('./db.js');
		await resetDbConnectionForTests();
		await new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase(DB_NAME);
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});

		const { buildValidPackageFiles } =
			await import('$lib/content/__fixtures__/lucys-portmonnaie.js');
		manifest = buildValidPackageFiles()['manifest.json'] as Manifest;
		await seed();
	});

	/** A device mid-story: one installed package, its character, a savegame and a profile. */
	async function seed(): Promise<void> {
		const { LUCY_ID } = await import('$lib/content/__fixtures__/lucys-portmonnaie.js');
		const { storyRegistry } = await import('./story-registry.js');
		const { characterLibrary } = await import('./character-library.js');
		const { saveStore } = await import('./save-store.js');
		const { playerProfileStore } = await import('./player-profile-store.js');

		await storyRegistry.install(manifest, { characterIds: [LUCY_ID], sizeBytes: 1024 });
		await characterLibrary.upsertFromPackage(
			{ id: LUCY_ID, displayName: 'Lucy', originPackage: manifest.id, shareable: true },
			manifest.id
		);
		await saveStore.createForPackage(manifest.id);
		await playerProfileStore.save({ displayName: 'Alex', addressAs: 'they/them' });
	}

	it('clears saves only, leaving installed content and the profile in place', async () => {
		const { clearSaves } = await import('./clear-data.js');
		await clearSaves();

		const { storyRegistry } = await import('./story-registry.js');
		const { saveStore } = await import('./save-store.js');
		const { playerProfileStore } = await import('./player-profile-store.js');
		expect(await saveStore.getForPackage(manifest.id)).toBeUndefined();
		expect(await storyRegistry.list()).toHaveLength(1);
		expect((await playerProfileStore.get())?.displayName).toBe('Alex');
	});

	it('clears every store and the asset cache on a factory reset', async () => {
		const { clearAllStoredData } = await import('./clear-data.js');
		await clearAllStoredData();

		const { storyRegistry } = await import('./story-registry.js');
		const { characterLibrary } = await import('./character-library.js');
		const { saveStore } = await import('./save-store.js');
		const { playerProfileStore } = await import('./player-profile-store.js');
		const { ASSET_CACHE_NAME } = await import('./blob-store.js');

		expect(await storyRegistry.list()).toEqual([]);
		expect(await characterLibrary.list()).toEqual([]);
		expect(await saveStore.getForPackage(manifest.id)).toBeUndefined();
		expect(await playerProfileStore.get()).toBeUndefined();
		expect(deletedCaches).toEqual([ASSET_CACHE_NAME]);
	});

	it('leaves the database usable — the empty library can install a package right after', async () => {
		const { clearAllStoredData } = await import('./clear-data.js');
		await clearAllStoredData();

		const { storyRegistry } = await import('./story-registry.js');
		const reinstalled = await storyRegistry.install(manifest, {
			characterIds: [],
			sizeBytes: 512
		});
		expect(reinstalled?.id).toBe(manifest.id);
	});
});
