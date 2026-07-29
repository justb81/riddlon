import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterIdentity, Manifest } from '$lib/content/index.js';

vi.mock('$app/environment', () => ({ browser: true }));

describe('installPackageCharacters (real IndexedDB via fake-indexeddb)', () => {
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

	it('installing the same package twice never creates two identities for the same character', async () => {
		const { installPackageCharacters } = await import('./install.js');
		const { characterLibrary } = await import('$lib/storage/index.js');
		const { buildValidPackageFiles, LUCY_ID, MAX_ID, SABINE_ID } =
			await import('$lib/content/__fixtures__/lucys-portmonnaie.js');
		const files = buildValidPackageFiles();
		const manifest = files['manifest.json'] as Manifest;
		const characters = [
			files[`characters/${LUCY_ID}.character.json`] as CharacterIdentity,
			files[`characters/${MAX_ID}.character.json`] as CharacterIdentity,
			files[`characters/${SABINE_ID}.character.json`] as CharacterIdentity
		];

		await installPackageCharacters(manifest.id, characters);
		await installPackageCharacters(manifest.id, characters); // re-install, e.g. a repair/update flow

		const library = await characterLibrary.list();
		expect(library).toHaveLength(3);
		const lucy = library.find((record) => record.id === LUCY_ID)!;
		expect(lucy.linkedPackageIds).toEqual([manifest.id]);
	});

	it('two independently-authored packages sharing a character UUID link to one identity', async () => {
		const { installPackageCharacters } = await import('./install.js');
		const { characterLibrary } = await import('$lib/storage/index.js');
		const { buildValidPackageFiles, LUCY_ID } =
			await import('$lib/content/__fixtures__/lucys-portmonnaie.js');
		const { secondPackageManifest, secondPackageLucyCharacterFile } =
			await import('$lib/content/__fixtures__/second-package.js');
		const files = buildValidPackageFiles();
		const firstManifest = files['manifest.json'] as Manifest;

		await installPackageCharacters(firstManifest.id, [
			files[`characters/${LUCY_ID}.character.json`] as CharacterIdentity
		]);
		const secondManifest = secondPackageManifest();
		await installPackageCharacters(secondManifest.id, [secondPackageLucyCharacterFile()]);

		const library = await characterLibrary.list();
		expect(library).toHaveLength(1);
		expect(library[0].linkedPackageIds.sort()).toEqual(
			[firstManifest.id, secondManifest.id].sort()
		);
	});
});
