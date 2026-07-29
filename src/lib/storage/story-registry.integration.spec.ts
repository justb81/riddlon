import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterIdentity, Manifest } from '$lib/content/index.js';

vi.mock('$app/environment', () => ({ browser: true }));

describe('storyRegistry + characterLibrary (real IndexedDB via fake-indexeddb)', () => {
	beforeEach(async () => {
		const { resetDbConnectionForTests, DB_NAME } = await import('./db.js');
		await resetDbConnectionForTests();
		await new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase(DB_NAME);
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});
	});

	it('installing two packages that share a character UUID stores exactly one linked record', async () => {
		const { storyRegistry } = await import('./story-registry.js');
		const { characterLibrary } = await import('./character-library.js');
		const { buildValidPackageFiles, LUCY_ID } =
			await import('$lib/content/__fixtures__/lucys-portmonnaie.js');
		const { secondPackageManifest, secondPackageLucyCharacterFile, SECOND_PACKAGE_ID } =
			await import('$lib/content/__fixtures__/second-package.js');

		const { MAX_ID, SABINE_ID } = await import('$lib/content/__fixtures__/lucys-portmonnaie.js');
		const files = buildValidPackageFiles();
		const firstManifest = files['manifest.json'] as Manifest;
		await storyRegistry.install(firstManifest, {
			characterIds: [LUCY_ID, MAX_ID, SABINE_ID],
			sizeBytes: 1000
		});
		await characterLibrary.upsertFromPackage(
			files[`characters/${LUCY_ID}.character.json`] as CharacterIdentity,
			firstManifest.id
		);

		const secondManifest = secondPackageManifest();
		await storyRegistry.install(secondManifest, {
			characterIds: [LUCY_ID],
			sizeBytes: 500
		});
		await characterLibrary.upsertFromPackage(secondPackageLucyCharacterFile(), SECOND_PACKAGE_ID);

		const libraryRecords = await characterLibrary.list();
		const lucyRecords = libraryRecords.filter((record) => record.id === LUCY_ID);
		expect(lucyRecords).toHaveLength(1);
		expect(lucyRecords[0].linkedPackageIds.sort()).toEqual(
			[firstManifest.id, SECOND_PACKAGE_ID].sort()
		);

		const installedPackages = await storyRegistry.list();
		expect(installedPackages.map((p) => p.id).sort()).toEqual(
			[firstManifest.id, SECOND_PACKAGE_ID].sort()
		);
	});

	it('uninstalling a package unlinks its characters without deleting still-shared ones', async () => {
		const { storyRegistry } = await import('./story-registry.js');
		const { characterLibrary } = await import('./character-library.js');
		const { buildValidPackageFiles, LUCY_ID, MAX_ID, SABINE_ID } =
			await import('$lib/content/__fixtures__/lucys-portmonnaie.js');
		const { secondPackageManifest, secondPackageLucyCharacterFile, SECOND_PACKAGE_ID } =
			await import('$lib/content/__fixtures__/second-package.js');

		const files = buildValidPackageFiles();
		const firstManifest = files['manifest.json'] as Manifest;
		await storyRegistry.install(firstManifest, {
			characterIds: [LUCY_ID, MAX_ID, SABINE_ID],
			sizeBytes: 1000
		});
		await characterLibrary.upsertFromPackage(
			files[`characters/${LUCY_ID}.character.json`] as CharacterIdentity,
			firstManifest.id
		);
		await characterLibrary.upsertFromPackage(
			files[`characters/${MAX_ID}.character.json`] as CharacterIdentity,
			firstManifest.id
		);

		const secondManifest = secondPackageManifest();
		await storyRegistry.install(secondManifest, { characterIds: [LUCY_ID], sizeBytes: 500 });
		await characterLibrary.upsertFromPackage(secondPackageLucyCharacterFile(), SECOND_PACKAGE_ID);

		await storyRegistry.uninstall(firstManifest.id);

		expect(await storyRegistry.get(firstManifest.id)).toBeUndefined();
		// Lucy is still linked from the second package — must survive.
		expect(await characterLibrary.getById(LUCY_ID)).toBeDefined();
		// Max was only referenced by the uninstalled package — must be gone.
		expect(await characterLibrary.getById(MAX_ID)).toBeUndefined();
	});
});
