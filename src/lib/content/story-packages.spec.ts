/**
 * Guards the story packages actually shipped from `stories/` (issue #19), so `npm test`
 * fails on broken content without anyone having to remember to run the release build.
 * `scripts/build-stories.mjs` runs the same `validatePackage` plus the packaging-only
 * checks (undeclared files, missing assets) that need the on-disk layout.
 */

import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validatePackage } from './validate-package.js';
import { loadStoryBundle } from './load-package.js';
import {
	readStoryPackageFiles,
	WALKTHROUGH_PACKAGE_DIR,
	SCENE_GROUP_CONFRONTATION,
	SCENE_LUCY_INTRO,
	SCENE_LUCY_SUSPICION,
	SCENE_MAX_QUESTIONING_1,
	SCENE_MAX_QUESTIONING_2,
	SCENE_REPORT_1,
	SCENE_REPORT_2,
	SCENE_SABINE_QUESTIONING_1,
	SCENE_SABINE_QUESTIONING_2,
	SCENE_UNKNOWN_CONTACT
} from './__fixtures__/lucys-portmonnaie-walkthrough.js';

const STORIES_DIR = path.resolve(WALKTHROUGH_PACKAGE_DIR, '..');

const storySlugs = readdirSync(STORIES_DIR, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

describe('shipped story packages in stories/', () => {
	it('there is at least one package to ship', () => {
		expect(storySlugs).toContain('lucys-portmonnaie');
	});

	it.each(storySlugs)('%s validates against the package format with zero errors', (slug) => {
		const result = validatePackage(readStoryPackageFiles(path.join(STORIES_DIR, slug)));
		expect(result.errors).toEqual([]);
		expect(result.valid).toBe(true);
	});

	it.each(storySlugs)('%s loads into a StoryBundle the engine can run', (slug) => {
		const result = loadStoryBundle(readStoryPackageFiles(path.join(STORIES_DIR, slug)));
		expect(result.bundle?.graph.nodes.length).toBeGreaterThan(0);
	});

	it('every package id and title is unique across stories/', () => {
		const manifests = storySlugs.map(
			(slug) =>
				readStoryPackageFiles(path.join(STORIES_DIR, slug))['manifest.json'] as {
					id: string;
					title: string;
				}
		);
		expect(new Set(manifests.map((m) => m.id)).size).toBe(manifests.length);
		expect(new Set(manifests.map((m) => m.title)).size).toBe(manifests.length);
	});

	it.each(storySlugs)('%s ships every asset its characters reference', (slug) => {
		const dir = path.join(STORIES_DIR, slug);
		const files = readStoryPackageFiles(dir);
		const manifest = files['manifest.json'] as { characters: string[] };
		const missing = manifest.characters
			.map((charPath) => (files[charPath] as { avatar?: string }).avatar)
			.filter((avatar) => avatar !== undefined)
			.filter((avatar) => !existsSync(path.join(dir, avatar)));
		expect(missing).toEqual([]);
	});
});

describe('lucys-portmonnaie: the scene ids specs name still exist in the package', () => {
	it('every exported SCENE_* constant resolves to a shipped scene node', () => {
		const files = readStoryPackageFiles(WALKTHROUGH_PACKAGE_DIR);
		const manifest = files['manifest.json'] as { entryGraph: string };
		const graph = files[manifest.entryGraph] as { nodes: { id: string }[] };
		const shippedIds = new Set(graph.nodes.map((node) => node.id));

		expect([...shippedIds].sort()).toEqual(
			[
				SCENE_UNKNOWN_CONTACT,
				SCENE_LUCY_INTRO,
				SCENE_MAX_QUESTIONING_1,
				SCENE_SABINE_QUESTIONING_1,
				SCENE_REPORT_1,
				SCENE_LUCY_SUSPICION,
				SCENE_MAX_QUESTIONING_2,
				SCENE_SABINE_QUESTIONING_2,
				SCENE_REPORT_2,
				SCENE_GROUP_CONFRONTATION
			].sort()
		);
	});
});
