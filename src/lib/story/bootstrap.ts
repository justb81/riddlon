/**
 * Installs the reference story the first time the app runs on a device, through the real
 * `content/` ZIP pipeline (validation, asset storage, character-library dedup, registry) —
 * not a shortcut around it. Every later call is a no-op that returns the existing install.
 */

import { zipSync, type Zippable } from 'fflate';
import { installPackageFromZipBytes } from '$lib/content/index.js';
import { storyRegistry, type InstalledPackageSummary } from '$lib/storage/index.js';
import { isDemoStorySkipped, setDemoStorySkipped } from './demo-story.js';
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
	// A player who reset the app back to an empty library must not get the demo re-seeded
	// under them on the next boot — see `demo-story.ts`.
	if (isDemoStorySkipped()) return undefined;

	return installReferenceStory();
}

/** Explicit "Demo-Geschichte installieren" from the empty library — clears the opt-out a
 *  factory reset set, so a later boot keeps the demo rather than skipping it again. */
export async function installDemoStory(): Promise<InstalledPackageSummary | undefined> {
	setDemoStorySkipped(false);
	return (await storyRegistry.get(PACKAGE_ID)) ?? (await installReferenceStory());
}

async function installReferenceStory(): Promise<InstalledPackageSummary | undefined> {
	const bytes = zipJsonFiles(buildReferencePackageFiles());
	const result = await installPackageFromZipBytes(bytes);
	return result.ok ? result.summary : undefined;
}
