import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
	CharacterIdentity,
	Clue,
	Fact,
	Manifest,
	PlayerProfile,
	Secret,
	Story,
	StoryGraph
} from '$lib/content/index.js';

/** The parsed, schema-valid package content `validatePackage` already produced at import
 *  time — persisted alongside the manifest so the engine can be reconstructed on a later
 *  app start without re-fetching/re-parsing the original ZIP (which isn't kept around). */
export interface InstalledPackageContent {
	story: Story;
	graph: StoryGraph;
	clues: Clue[];
	facts: Fact[];
	secrets: Secret[];
}

export interface InstalledPackageRecord {
	/** = manifest.id, the package's own UUID. */
	id: string;
	title: string;
	version: string;
	formatVersion: string;
	status: 'installed' | 'installing' | 'error' | 'update-available';
	installedAt: string;
	coverAssetKey?: string;
	sizeBytes: number;
	/** Denormalized for quick uninstall/lookup without re-parsing manifest.characters[]. */
	characterIds: string[];
	/** Package-relative asset path (e.g. a character's `avatar`) -> content-addressed
	 *  blob-store key (see `putAsset`/`assetKeyForBlob`). Absent on records installed before #10. */
	assetKeys?: Record<string, string>;
	manifest: Manifest;
	/** Absent on records installed before this field existed — `storyRegistry.getBundle()`
	 *  returns `undefined` for those rather than a half-formed bundle. */
	content?: InstalledPackageContent;
}

export interface LibraryCharacterRecord extends CharacterIdentity {
	/** Every currently-installed package whose manifest references this character. */
	linkedPackageIds: string[];
}

export interface SaveChatMessage {
	id: string;
	sceneId: string;
	from: string;
	text: string;
	sentAt: string;
}

export interface PendingDelayedEvent {
	eventId: string;
	dueAt: string;
	fired: boolean;
}

/** One source's claim about a clue — never overwritten by another source's claim (#8). */
export interface ClueClaimRecord {
	characterId: string;
	value: string;
}

export interface ClueStateRecord {
	clueId: string;
	claims: ClueClaimRecord[];
	/** Whether a previously-conflicting clue has been resolved by the engine/UI. */
	resolved: boolean;
}

export interface SaveRecord {
	id: string;
	packageId: string;
	createdAt: string;
	updatedAt: string;
	flags: Record<string, boolean>;
	unlockedSceneIds: string[];
	/** Added alongside unlockedSceneIds for #7's progress tracking; absent on older records. */
	completedSceneIds: string[];
	/** Fired group-chat-scene outcome ids (#7 §5.7); absent on older records. */
	reachedOutcomeIds: string[];
	/** Characters force-unlocked via an `unlock-character:` action; absent on older records. */
	unlockedCharacterIds: string[];
	chatHistory: SaveChatMessage[];
	pendingDelayedEvents: PendingDelayedEvent[];
	/** Added for #8; absent on records written before clue tracking existed. */
	clueStates: ClueStateRecord[];
}

export interface PlayerProfileRecord extends PlayerProfile {
	id: 'singleton';
	updatedAt: string;
}

interface RiddlonDBSchema extends DBSchema {
	packages: { key: string; value: InstalledPackageRecord; indexes: { 'by-status': string } };
	characters: { key: string; value: LibraryCharacterRecord };
	saves: { key: string; value: SaveRecord; indexes: { 'by-packageId': string } };
	playerProfile: { key: string; value: PlayerProfileRecord };
}

export const DB_NAME = 'riddlon';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RiddlonDBSchema>> | undefined;

/**
 * Opens (and memoizes) the app's IndexedDB database. Assumes it's called from browser
 * context — callers (the repository modules) are responsible for the `browser` SSR guard,
 * matching the per-call-site convention already used by `$lib/state/onboarding.ts`.
 */
export function getDb(): Promise<IDBPDatabase<RiddlonDBSchema>> {
	if (!dbPromise) {
		dbPromise = openDB<RiddlonDBSchema>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('packages')) {
					const packages = db.createObjectStore('packages', { keyPath: 'id' });
					packages.createIndex('by-status', 'status');
				}
				if (!db.objectStoreNames.contains('characters')) {
					db.createObjectStore('characters', { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains('saves')) {
					const saves = db.createObjectStore('saves', { keyPath: 'id' });
					saves.createIndex('by-packageId', 'packageId');
				}
				if (!db.objectStoreNames.contains('playerProfile')) {
					db.createObjectStore('playerProfile', { keyPath: 'id' });
				}
			}
		});
	}
	return dbPromise;
}

/**
 * Test-only: close the memoized connection (if any) so the next getDb() call re-opens
 * fresh, and so a subsequent indexedDB.deleteDatabase() doesn't hang forever waiting for
 * this connection to close (IndexedDB blocks deletion while any connection stays open).
 */
export async function resetDbConnectionForTests(): Promise<void> {
	if (dbPromise) {
		const db = await dbPromise;
		db.close();
		dbPromise = undefined;
	}
}
