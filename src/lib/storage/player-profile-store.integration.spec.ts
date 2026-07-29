import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

describe('playerProfileStore (real IndexedDB via fake-indexeddb)', () => {
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

	it('survives a fresh db handle (proxy for surviving a page reload)', async () => {
		const { playerProfileStore } = await import('./player-profile-store.js');
		await playerProfileStore.save({ displayName: 'Alex', addressAs: 'they' });

		const { resetDbConnectionForTests } = await import('./db.js');
		await resetDbConnectionForTests();

		const reloaded = await playerProfileStore.get();
		expect(reloaded).toEqual({ displayName: 'Alex', addressAs: 'they' });
	});

	it('rejects an invalid profile (neither addressAs nor pronouns) before writing', async () => {
		const { playerProfileStore, PlayerProfileValidationError } =
			await import('./player-profile-store.js');
		await expect(playerProfileStore.save({ displayName: 'Alex' })).rejects.toBeInstanceOf(
			PlayerProfileValidationError
		);
		expect(await playerProfileStore.get()).toBeUndefined();
	});
});
