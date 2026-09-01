/**
 * The shipped reference package `stories/lucys-portmonnaie/` (issue #19), read straight off
 * disk as the acceptance fixture for the engine issues (#7 scenes, #8 clues/contradictions,
 * #9 delayed events).
 *
 * It deliberately does NOT restate the story as inline TypeScript: the package that gets
 * zipped and released is the same content the walkthrough test plays through, so shipped
 * story and the test guarding it can't drift. Editing the story means editing the JSON.
 *
 * Node-only (`node:fs`): this is a test fixture, imported exclusively from `*.spec.ts` files
 * running in Vitest's `server` project — never from app code, which must stay browser-safe.
 *
 * Hans (docs/arc42 §1.3 step 9) stays a mentioned-but-offscreen source, per issue #19 —
 * no character file, so his accusation is only a clue that Lucy relays.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LUCY_ID, MAX_ID, PACKAGE_ID, SABINE_ID } from './lucys-portmonnaie.js';

export { LUCY_ID, MAX_ID, PACKAGE_ID, SABINE_ID };

/** `src/lib/content/__fixtures__/` -> repo root -> the shipped package directory. */
export const WALKTHROUGH_PACKAGE_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../../stories/lucys-portmonnaie'
);

/**
 * Scene ids as shipped in `story/graph.json`. Mirrored here so specs can name a scene
 * readably; `story-packages.spec.ts` asserts each one still exists in the package, so a
 * renamed scene fails loudly instead of silently making an assertion vacuous.
 */
export const SCENE_UNKNOWN_CONTACT = 'ce658bbf-33df-48d6-a2f6-e1568566fb8e';
export const SCENE_LUCY_INTRO = '32e477b0-6721-47cb-867e-cc181ed7c72f';
export const SCENE_MAX_QUESTIONING_1 = '0974a346-476c-4222-976e-ee43854fc709';
export const SCENE_SABINE_QUESTIONING_1 = '8e888a69-8631-40d8-af8d-a397d544ad20';
export const SCENE_REPORT_1 = '45fd7837-17ae-4ebe-b6fe-407779be1d79';
export const SCENE_LUCY_SUSPICION = 'b35e409f-d012-41ae-a655-8693901c086d';
export const SCENE_MAX_QUESTIONING_2 = '725e3554-0a53-49fa-9bb5-f80929dc685b';
export const SCENE_SABINE_QUESTIONING_2 = '107ad6e6-72d9-4039-a2c1-34e79113d7f5';
export const SCENE_REPORT_2 = '8bc89ff8-3769-421f-8737-a80a2525c2c0';
export const SCENE_GROUP_CONFRONTATION = '2c608d80-cbf4-44cc-bc62-d3f449616ccd';

function readJson(packageDir: string, relativePath: string): unknown {
	return JSON.parse(readFileSync(path.join(packageDir, relativePath), 'utf8'));
}

interface PackageManifestPaths {
	entryStory: string;
	entryGraph: string;
	characters: string[];
	world: string[];
}

/**
 * Loads a story package directory into the `Record<path, parsedJson>` shape
 * `validatePackage`/`loadStoryBundle` consume — exactly the files the manifest declares,
 * which is exactly what the player reads back after unzipping (#10).
 */
export function readStoryPackageFiles(packageDir: string): Record<string, unknown> {
	const manifest = readJson(packageDir, 'manifest.json') as PackageManifestPaths;
	const files: Record<string, unknown> = { 'manifest.json': manifest };
	for (const relativePath of [
		manifest.entryStory,
		manifest.entryGraph,
		...manifest.characters,
		...manifest.world
	]) {
		files[relativePath] = readJson(packageDir, relativePath);
	}
	return files;
}

/** The shipped "Lucys Portmonnaie" package, covering all 15 steps of docs/arc42 §1.3. */
export function buildWalkthroughPackageFiles(): Record<string, unknown> {
	return readStoryPackageFiles(WALKTHROUGH_PACKAGE_DIR);
}
