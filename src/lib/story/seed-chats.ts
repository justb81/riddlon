/**
 * Turns a package's authored `story.seedChats` into savegame messages (docs/arc42 §8.1.8, #30).
 *
 * Why the save and not `EngineState`: seed messages are installed content, never authored by the
 * LLM and never re-derivable, so they belong in the same chat log as everything else the player
 * has said — which also makes them survive a reload for free. They are materialized once, when
 * the playthrough's save is created, and are then indistinguishable from history the player
 * lived through, except for the `seed` marker.
 *
 * Timestamps are computed from `startedAt` minus each message's authored `offset`, so a freshly
 * unlocked contact opens on a conversation that looks days old instead of one minted the moment
 * the plot needed it — the disguise premise of docs/arc42 §1.2 leans on exactly that.
 *
 * Framework-free and browser-free, so the Node test project can reach it.
 */

import type { StoryBundle } from '$lib/content/index.js';
import { parseIsoDurationMs } from '$lib/engine/duration.js';
import type { SaveChatMessage } from '$lib/storage/index.js';

export interface SeedChatOptions {
	/** Epoch ms the playthrough starts at — seed offsets are measured backwards from here. */
	startedAt?: number;
	/** Injectable for deterministic tests; defaults to real UUIDs. */
	newId?: () => string;
}

/**
 * Seed messages for every scene the package seeds, oldest first per thread.
 *
 * A seed chat whose `sceneRef` names no scene in the graph is skipped: `validate-package.ts`
 * rejects that at install time, but a package installed by an older player could carry one, and
 * a message on a scene no thread contains would be invisible dead weight in every save.
 */
export function buildSeedChatMessages(
	bundle: StoryBundle,
	options: SeedChatOptions = {}
): SaveChatMessage[] {
	const startedAt = options.startedAt ?? Date.now();
	const newId = options.newId ?? (() => crypto.randomUUID());
	const sceneIds = new Set(bundle.graph.nodes.map((node) => node.id));
	const messages: SaveChatMessage[] = [];

	for (const seedChat of bundle.story.seedChats) {
		if (!sceneIds.has(seedChat.sceneRef)) continue;
		const seeded = seedChat.messages.map((message) => ({
			id: newId(),
			sceneId: seedChat.sceneRef,
			from: message.from,
			text: message.text,
			// A malformed duration is already a schema error upstream; treating it as "just before
			// the story started" keeps the thread readable rather than dropping the line.
			sentAt: new Date(startedAt - (parseIsoDurationMs(message.offset) ?? 0)).toISOString(),
			seed: true
		}));
		// Authored order wins for equal offsets (a stable sort), so a back-and-forth written in
		// dialogue order stays in dialogue order even when both lines share one offset.
		seeded.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
		messages.push(...seeded);
	}

	return messages;
}
