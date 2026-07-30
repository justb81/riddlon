/**
 * Installs the reference story the first time the app runs on a device, through the real
 * `content/` ZIP pipeline (validation, asset storage, character-library dedup, registry) —
 * not a shortcut around it. Every later call is a no-op that returns the existing install.
 */

import { zipSync, type Zippable } from 'fflate';
import { installPackageFromZipBytes } from '$lib/content/index.js';
import { storyRegistry, type InstalledPackageSummary } from '$lib/storage/index.js';
import { PACKAGE_ID, buildReferencePackageFiles } from './reference-package.js';

function zipJsonFiles(files: Record<string, unknown>): Uint8Array {
	const encoder = new TextEncoder();
	const zippable: Zippable = {};
	for (const [path, value] of Object.entries(files)) {
		zippable[path] = encoder.encode(JSON.stringify(value));
	}
	return zipSync(zippable);
}

export async function ensureReferenceStoryInstalled(): Promise<
	InstalledPackageSummary | undefined
> {
	const existing = await storyRegistry.get(PACKAGE_ID);
	if (existing) return existing;

	const bytes = zipJsonFiles(buildReferencePackageFiles());
	const result = await installPackageFromZipBytes(bytes);
	return result.ok ? result.summary : undefined;
}
