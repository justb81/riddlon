import { browser } from '$app/environment';
import type { Manifest, StoryBundle } from '$lib/content/index.js';
import { getDb, type InstalledPackageContent, type InstalledPackageRecord } from './db.js';
import { characterLibrary } from './character-library.js';

export type InstalledPackageSummary = Omit<InstalledPackageRecord, 'manifest' | 'content'> & {
	/** Lifted out of the manifest, which a summary otherwise drops, so the library card can show
	 *  the package's own classification (#53). Empty for records installed before the field. */
	tags: string[];
};

function toSummary(record: InstalledPackageRecord): InstalledPackageSummary {
	return {
		id: record.id,
		title: record.title,
		version: record.version,
		formatVersion: record.formatVersion,
		status: record.status,
		installedAt: record.installedAt,
		coverAssetKey: record.coverAssetKey,
		sizeBytes: record.sizeBytes,
		characterIds: record.characterIds,
		assetKeys: record.assetKeys,
		tags: record.manifest.tags ?? []
	};
}

export interface InstallPackageOptions {
	characterIds: string[];
	coverAssetKey?: string;
	sizeBytes: number;
	assetKeys?: Record<string, string>;
	/** The parsed package content, so `getBundle()` can reconstruct a `StoryBundle` for the
	 *  engine later without re-fetching the original ZIP. Absent for callers that only have
	 *  a manifest (keeps this an additive, backward-compatible field). */
	content?: InstalledPackageContent;
}

/**
 * Pure metadata store — it does NOT decide character link-vs-create itself (that's
 * `characterLibrary`'s job, see character-library.ts) to avoid a circular dependency with
 * `$lib/characters` (#6 depends on this module, not the reverse). `install()` just records
 * which characters this package references, for `uninstall()`'s unlink step.
 */
export const storyRegistry = {
	async install(
		manifest: Manifest,
		opts: InstallPackageOptions
	): Promise<InstalledPackageSummary | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		const record: InstalledPackageRecord = {
			id: manifest.id,
			title: manifest.title,
			version: manifest.version,
			formatVersion: manifest.formatVersion,
			status: 'installed',
			installedAt: new Date().toISOString(),
			coverAssetKey: opts.coverAssetKey,
			sizeBytes: opts.sizeBytes,
			characterIds: opts.characterIds,
			assetKeys: opts.assetKeys,
			manifest,
			content: opts.content
		};
		await db.put('packages', record);
		return toSummary(record);
	},

	async uninstall(packageId: string): Promise<void> {
		if (!browser) return;
		const db = await getDb();
		const record = await db.get('packages', packageId);
		if (!record) return;
		await Promise.all(
			record.characterIds.map((characterId) =>
				characterLibrary.unlinkPackage(characterId, packageId)
			)
		);
		await db.delete('packages', packageId);
	},

	async get(packageId: string): Promise<InstalledPackageSummary | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		const record = await db.get('packages', packageId);
		return record ? toSummary(record) : undefined;
	},

	async getManifest(packageId: string): Promise<Manifest | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		const record = await db.get('packages', packageId);
		return record?.manifest;
	},

	/** Reconstructs the `StoryBundle` the engine needs, from the parsed content stored at
	 *  install time. `undefined` if the package isn't installed, or was installed before
	 *  this field existed. */
	async getBundle(packageId: string): Promise<StoryBundle | undefined> {
		if (!browser) return undefined;
		const db = await getDb();
		const record = await db.get('packages', packageId);
		if (!record?.content) return undefined;
		return {
			manifest: record.manifest,
			story: record.content.story,
			graph: record.content.graph,
			clues: record.content.clues,
			facts: record.content.facts,
			secrets: record.content.secrets
		};
	},

	async list(): Promise<InstalledPackageSummary[]> {
		if (!browser) return [];
		const db = await getDb();
		const records = await db.getAll('packages');
		return records.map(toSummary);
	},

	async setStatus(packageId: string, status: InstalledPackageRecord['status']): Promise<void> {
		if (!browser) return;
		const db = await getDb();
		const record = await db.get('packages', packageId);
		if (!record) return;
		await db.put('packages', { ...record, status });
	}
};
