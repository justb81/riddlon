import { browser } from '$app/environment';
import { getDb, type SaveChatMessage, type SaveRecord } from './db.js';

/**
 * Savegame shape isn't specified in docs/arc42 — designed from scratch to cover what
 * a future engine needs: `flags` (entry/exit-condition state), `unlockedSceneIds` +
 * `completedSceneIds` + `reachedOutcomeIds` (progress, #7), `unlockedCharacterIds` (explicit
 * unlocks, #7), `clueStates` (multi-source claims, #8), `chatHistory`, and
 * `pendingDelayedEvents` (persisted due-dates, checked opportunistically on next app
 * open/resume per §8.1.6 — no setTimeout/service-worker-alarm reliance; `$lib/engine`
 * implements the actual reconciliation loop, this module only persists the state it needs).
 */
export const saveStore = {
	/**
	 * `seedMessages` is the package's authored thread history (#30), materialized into the save
	 * once, at creation: it is installed content that can never be re-derived, so it belongs in
	 * the same place as the rest of the chat log rather than in `EngineState`. Built by
	 * `story/seed-chats.ts` — this store stays free of any knowledge of the package format.
	 */
	async createForPackage(
		packageId: string,
		seedMessages: readonly SaveChatMessage[] = []
	): Promise<SaveRecord | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		const now = new Date().toISOString();
		const record: SaveRecord = {
			id: crypto.randomUUID(),
			packageId,
			createdAt: now,
			updatedAt: now,
			flags: {},
			unlockedSceneIds: [],
			completedSceneIds: [],
			reachedOutcomeIds: [],
			unlockedCharacterIds: [],
			chatHistory: [...seedMessages],
			pendingDelayedEvents: [],
			clueStates: [],
			earnedAchievementIds: []
		};
		await db.put('saves', record);
		return record;
	},

	async get(saveId: string): Promise<SaveRecord | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		return db.get('saves', saveId);
	},

	async getForPackage(packageId: string): Promise<SaveRecord | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		return db.getFromIndex('saves', 'by-packageId', packageId);
	},

	async update(
		saveId: string,
		patch: Partial<
			Pick<
				SaveRecord,
				| 'flags'
				| 'unlockedSceneIds'
				| 'completedSceneIds'
				| 'reachedOutcomeIds'
				| 'unlockedCharacterIds'
				| 'chatHistory'
				| 'pendingDelayedEvents'
				| 'clueStates'
				| 'earnedAchievementIds'
			>
		>
	): Promise<SaveRecord | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		const existing = await db.get('saves', saveId);
		if (!existing) return undefined;
		const updated: SaveRecord = {
			...existing,
			...patch,
			flags: patch.flags ? { ...existing.flags, ...patch.flags } : existing.flags,
			updatedAt: new Date().toISOString()
		};
		await db.put('saves', updated);
		return updated;
	},

	async appendChatMessage(
		saveId: string,
		message: SaveChatMessage
	): Promise<SaveRecord | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		const existing = await db.get('saves', saveId);
		if (!existing) return undefined;
		const updated: SaveRecord = {
			...existing,
			chatHistory: [...existing.chatHistory, message],
			updatedAt: new Date().toISOString()
		};
		await db.put('saves', updated);
		return updated;
	},

	async delete(saveId: string): Promise<void> {
		if (!browser) return;
		const db = await getDb();
		await db.delete('saves', saveId);
	}
};
