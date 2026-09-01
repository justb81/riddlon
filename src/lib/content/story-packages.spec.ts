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

	/**
	 * A fact nobody knows is invisible: `buildPersonaPrompt` only ever shows a character the facts
	 * their own cast binding lists, so a fact in `world/facts.json` that no binding claims can never
	 * reach the model. That is how `fact:lucy-max-sabine-are-friends` shipped unreachable while a
	 * scene goal asked Lucy to name Max and Sabine — she was never told they exist.
	 *
	 * Not a `validatePackage` rule: an unused fact is legal in the format, this is a lint on the
	 * content *we* ship.
	 */
	it.each(storySlugs)('%s gives every declared fact to at least one character', (slug) => {
		const files = readStoryPackageFiles(path.join(STORIES_DIR, slug));
		const bundle = loadStoryBundle(files).bundle;
		const known = new Set(
			bundle?.story.castBindings.flatMap((binding) => binding.knowledge.publicFacts) ?? []
		);
		const orphaned = (bundle?.facts ?? []).map((fact) => fact.id).filter((id) => !known.has(id));
		expect(orphaned).toEqual([]);
	});

	/**
	 * An outcome whose flags nothing can set is an ending only a playtest script can reach. The
	 * director may only set `flag:` refs the *scene* declares — its `exitConditions` plus, for a
	 * group scene, its own outcome conditions (`llm/director.ts`'s `settableFlags`) — and a group
	 * scene deliberately ships no exit conditions, which is how `flag:evidence-presented` and
	 * `flag:false-accusation` ended up unsettable in play while the walkthrough still "solved" the
	 * story (#39, #55).
	 *
	 * Not a `validatePackage` rule: a package may legitimately drive an outcome from a flag some
	 * other scene sets. This is a lint on the content we ship.
	 */
	it.each(storySlugs)('%s can reach every outcome it declares from within the app', (slug) => {
		const bundle = loadStoryBundle(readStoryPackageFiles(path.join(STORIES_DIR, slug))).bundle;
		const settableFlags = new Set(
			(bundle?.graph.nodes ?? []).flatMap((node) => [
				...node.exitConditions,
				...(node.type === 'group-chat-scene'
					? node.outcomes.map((outcome) => outcome.condition)
					: [])
			])
		);
		const unreachable = (bundle?.graph.nodes ?? [])
			.filter((node) => node.type === 'group-chat-scene')
			.flatMap((node) => (node.type === 'group-chat-scene' ? node.outcomes : []))
			.filter(
				(outcome) => outcome.condition.startsWith('flag:') && !settableFlags.has(outcome.condition)
			)
			.map((outcome) => outcome.id);
		expect(unreachable).toEqual([]);
	});

	/** An achievement without conditions can never be awarded (#32) — fine in the format, not in
	 *  content we ship as the reference for what a package should look like. */
	it.each(storySlugs)('%s says when each of its achievements is earned', (slug) => {
		const bundle = loadStoryBundle(readStoryPackageFiles(path.join(STORIES_DIR, slug))).bundle;
		const inert = (bundle?.story.achievements ?? [])
			.filter((achievement) => achievement.conditions.length === 0)
			.map((achievement) => achievement.label);
		expect(inert).toEqual([]);
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

describe('lucys-portmonnaie: the beats §7 asks the reference story to validate', () => {
	/** docs/arc42 §7 step 6: both witnesses arrive with pre-generated history (#30). */
	it('seeds the first thread of both witnesses, and only with people in that thread', () => {
		const files = readStoryPackageFiles(WALKTHROUGH_PACKAGE_DIR);
		const bundle = loadStoryBundle(files).bundle;
		const seededScenes = (bundle?.story.seedChats ?? []).map((seed) => seed.sceneRef);
		expect(seededScenes).toEqual(
			expect.arrayContaining([SCENE_MAX_QUESTIONING_1, SCENE_SABINE_QUESTIONING_1])
		);

		for (const seed of bundle?.story.seedChats ?? []) {
			const node = bundle?.graph.nodes.find((candidate) => candidate.id === seed.sceneRef);
			const speakers = seed.messages.map((message) => message.from).filter((from) => from !== 'me');
			expect(speakers.every((speaker) => node?.participants.includes(speaker))).toBe(true);
		}
	});

	/** §7 step 15's three endings, all with real conditions now (#32). */
	it('conditions "Ohne Falschbeschuldigung" on the flag the group chat can actually set', () => {
		const bundle = loadStoryBundle(readStoryPackageFiles(WALKTHROUGH_PACKAGE_DIR)).bundle;
		const clean = bundle?.story.achievements.find((a) => a.label.startsWith('Ohne Falsch'));
		expect(clean?.conditions).toEqual([
			'outcome-reached:max-confesses',
			'not:flag:false-accusation'
		]);

		const group = bundle?.graph.nodes.find((node) => node.id === SCENE_GROUP_CONFRONTATION);
		if (group?.type !== 'group-chat-scene') throw new Error('group scene missing');
		// The negative case is only reachable because some outcome is conditioned on the flag.
		expect(group.outcomes.map((outcome) => outcome.condition)).toContain('flag:false-accusation');
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
