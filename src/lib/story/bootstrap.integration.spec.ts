import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

// Only the "skipped" path is exercised here: it returns before touching the ZIP pipeline, so it
// needs no Cache Storage (which Node lacks). The install path itself is covered by
// `content/install-package.integration.spec.ts` and by hand via `/dev/import`.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => void store.set(key, value),
	removeItem: (key: string) => void store.delete(key)
});

describe('ensureReferenceStoryInstalled', () => {
	beforeEach(async () => {
		store.clear();
		const { resetDbConnectionForTests, DB_NAME } = await import('$lib/storage/db.js');
		await resetDbConnectionForTests();
		await new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase(DB_NAME);
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});
	});

	it('does not re-seed the demo story once a reset opted out of it', async () => {
		const { setDemoStorySkipped } = await import('./demo-story.js');
		const { ensureReferenceStoryInstalled } = await import('./bootstrap.js');
		const { storyRegistry } = await import('$lib/storage/index.js');

		setDemoStorySkipped(true);

		expect(await ensureReferenceStoryInstalled()).toBeUndefined();
		expect(await storyRegistry.list()).toEqual([]);
	});
});
