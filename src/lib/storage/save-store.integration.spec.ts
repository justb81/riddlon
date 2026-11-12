import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env', () => ({ browser: true }));

describe('saveStore (real IndexedDB via fake-indexeddb)', () => {
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

	it('merges thread read markers and keeps them across a reload (#51)', async () => {
		const { saveStore } = await import('./save-store.js');
		const created = await saveStore.createForPackage('package-a');
		await saveStore.markThreadRead(created!.id, 'a', '2026-01-01T10:00:00.000Z');
		await saveStore.markThreadRead(created!.id, 'b', '2026-01-02T10:00:00.000Z');

		const { resetDbConnectionForTests } = await import('./db.js');
		await resetDbConnectionForTests();
		const reloaded = await saveStore.get(created!.id);
		expect(reloaded?.threadReads).toEqual({
			a: '2026-01-01T10:00:00.000Z',
			b: '2026-01-02T10:00:00.000Z'
		});
	});

	it('unions reached goals per scene and keeps them across a reload (#54)', async () => {
		const { saveStore } = await import('./save-store.js');
		const created = await saveStore.createForPackage('package-a');
		await saveStore.markGoalsReached(created!.id, 'scene-1', ['seed-timeline']);
		await saveStore.markGoalsReached(created!.id, 'scene-1', ['seed-location', 'seed-timeline']);
		await saveStore.markGoalsReached(created!.id, 'scene-2', ['report-findings']);

		const { resetDbConnectionForTests } = await import('./db.js');
		await resetDbConnectionForTests();
		const reloaded = await saveStore.get(created!.id);
		expect(reloaded?.reachedGoals).toEqual({
			'scene-1': ['seed-timeline', 'seed-location'],
			'scene-2': ['report-findings']
		});
	});

	it('survives a fresh db handle (proxy for surviving a page reload)', async () => {
		const { saveStore } = await import('./save-store.js');
		const created = await saveStore.createForPackage('package-a');
		expect(created).toBeDefined();

		const { resetDbConnectionForTests } = await import('./db.js');
		await resetDbConnectionForTests(); // simulates a fresh page load re-opening the same underlying db

		const reloaded = await saveStore.get(created!.id);
		expect(reloaded).toEqual(created);
	});

	it("writes the package's seed history into a new save, and keeps it across a reload (#30)", async () => {
		const { saveStore } = await import('./save-store.js');
		const seed = [
			{
				id: 'seed-1',
				sceneId: 'scene-max',
				from: 'max',
				text: 'Kommst du am Samstag mit?',
				sentAt: '2026-02-27T12:00:00.000Z',
				seed: true
			}
		];
		const created = await saveStore.createForPackage('package-a', seed);
		expect(created?.chatHistory).toEqual(seed);

		const { resetDbConnectionForTests } = await import('./db.js');
		await resetDbConnectionForTests();
		const reloaded = await saveStore.get(created!.id);
		// Installed content, not a runtime artifact — it must not need re-seeding on every open.
		expect(reloaded?.chatHistory).toEqual(seed);
	});

	it('appends chat messages and merges flag updates without clobbering unrelated flags', async () => {
		const { saveStore } = await import('./save-store.js');
		const save = await saveStore.createForPackage('package-a');
		await saveStore.update(save!.id, { flags: { 'flag:a': true } });
		await saveStore.update(save!.id, { flags: { 'flag:b': true } });
		await saveStore.appendChatMessage(save!.id, {
			id: 'm1',
			sceneId: 'scene-1',
			from: 'lucy',
			text: 'hi',
			sentAt: new Date(0).toISOString()
		});

		const updated = await saveStore.get(save!.id);
		expect(updated?.flags).toEqual({ 'flag:a': true, 'flag:b': true });
		expect(updated?.chatHistory).toHaveLength(1);
	});

	it('initializes and persists completedSceneIds + clueStates', async () => {
		const { saveStore } = await import('./save-store.js');
		const save = await saveStore.createForPackage('package-a');
		expect(save?.completedSceneIds).toEqual([]);
		expect(save?.clueStates).toEqual([]);

		await saveStore.update(save!.id, {
			completedSceneIds: ['scene-1'],
			clueStates: [
				{
					clueId: 'clue:time-window',
					claims: [{ characterId: 'max', value: '22:00' }],
					resolved: false
				}
			]
		});

		const updated = await saveStore.get(save!.id);
		expect(updated?.completedSceneIds).toEqual(['scene-1']);
		expect(updated?.clueStates).toHaveLength(1);
	});
});
