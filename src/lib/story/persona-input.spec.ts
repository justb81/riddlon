/**
 * Drives the persona composition against the story package actually shipped from `stories/`,
 * not a hand-written fixture — because the two bugs this covers were both "the content and the
 * prompt disagree", which a fixture built to match the code cannot catch:
 *
 *  - Lucy's scene 2 goal is `name-max-and-sabine-as-witnesses`, but nothing in her prompt said
 *    Max and Sabine exist. She improvised other names, `flag:witnesses-named` was never earned,
 *    and the story stopped at "Lucy bittet um Hilfe".
 *  - A secret whose `revealCondition` isn't met must sit in the withheld list. Merging the two
 *    lists would have Lucy volunteer Hans' tip before the story has reached it.
 *
 * Node-only (reads `stories/` off disk), like the engine walkthrough spec.
 */

import { describe, expect, it } from 'vitest';
import type { EffectiveCharacterState } from '$lib/characters/index.js';
import { resolveEffectiveCharacterState } from '$lib/characters/index.js';
import type { StoryBundle } from '$lib/content/index.js';
import { loadStoryBundle } from '$lib/content/load-package.js';
import {
	LUCY_ID,
	MAX_ID,
	SABINE_ID,
	SCENE_GROUP_CONFRONTATION,
	SCENE_LUCY_INTRO,
	SCENE_MAX_QUESTIONING_1,
	SCENE_UNKNOWN_CONTACT,
	WALKTHROUGH_PACKAGE_DIR,
	readStoryPackageFiles
} from '$lib/content/__fixtures__/lucys-portmonnaie-walkthrough.js';
import { buildScenePersonaPrompt, type PersonaContext } from './persona-input.js';

const bundle = loadStoryBundle(readStoryPackageFiles(WALKTHROUGH_PACKAGE_DIR)).bundle!;

const NAMES: Record<string, string> = { [LUCY_ID]: 'Lucy', [MAX_ID]: 'Max', [SABINE_ID]: 'Sabine' };

/** The shipped bindings, merged with an identity the way `loadCast()` does at runtime. */
const cast = bundle.story.castBindings.map((binding) =>
	resolveEffectiveCharacterState(
		{
			id: binding.characterRef,
			displayName: NAMES[binding.characterRef],
			originPackage: bundle.manifest.id,
			shareable: true
		},
		binding
	)
);

function contextWith(metConditions: readonly string[] = []): PersonaContext {
	return {
		bundle,
		cast,
		isConditionMet: (ref) => metConditions.includes(ref),
		storyTitle: bundle.manifest.title,
		playerName: 'Bastian'
	};
}

const soloWith = (characterId: string) => ({
	kind: 'solo' as const,
	participantIds: [characterId]
});

describe('buildScenePersonaPrompt against the shipped Lucys Portmonnaie package', () => {
	it('tells Lucy who Max and Sabine are, so her scene goal is reachable', () => {
		const prompt = buildScenePersonaPrompt(
			contextWith(),
			LUCY_ID,
			SCENE_LUCY_INTRO,
			soloWith(LUCY_ID)
		);
		expect(prompt).toContain('name-max-and-sabine-as-witnesses');
		expect(prompt).toContain('Diese Leute kennst du');
		expect(prompt).toContain('Max (friend)');
		expect(prompt).toContain('Sabine (friend)');
	});

	it('gives Lucy the canon facts her binding claims', () => {
		const prompt = buildScenePersonaPrompt(
			contextWith(),
			LUCY_ID,
			SCENE_UNKNOWN_CONTACT,
			soloWith(LUCY_ID)
		);
		expect(prompt).toContain('Kellerlicht');
		expect(prompt).toContain('Lucy, Max und Sabine kennen sich seit der Schulzeit');
	});

	it('withholds Hans’ tip until the first report is done, then releases it', () => {
		const before = buildScenePersonaPrompt(
			contextWith(),
			LUCY_ID,
			SCENE_LUCY_INTRO,
			soloWith(LUCY_ID)
		);
		expect(before).toContain('behältst es aber noch für dich');
		expect(before).not.toContain('Das darfst du jetzt preisgeben');

		const after = buildScenePersonaPrompt(
			contextWith(['flag:report-to-lucy-done']),
			LUCY_ID,
			SCENE_LUCY_INTRO,
			soloWith(LUCY_ID)
		);
		expect(after).toContain('Das darfst du jetzt preisgeben');
	});

	it('never hands one character another character’s secret', () => {
		// `secret:max-took-wallet` is the whole story's answer. It is Max's alone, held back until
		// he is confronted — Lucy's prompt must not contain it under any condition.
		const lucy = buildScenePersonaPrompt(
			contextWith([
				'flag:report-to-lucy-done',
				'flag:suspicion-relayed',
				'flag:evidence-presented'
			]),
			LUCY_ID,
			SCENE_LUCY_INTRO,
			soloWith(LUCY_ID)
		);
		expect(lucy).not.toContain('Lucys Portmonnaie heimlich aus ihrer Jacke');

		const max = buildScenePersonaPrompt(
			contextWith(['flag:evidence-presented']),
			MAX_ID,
			SCENE_GROUP_CONFRONTATION,
			{ kind: 'group', participantIds: [LUCY_ID, MAX_ID, SABINE_ID] }
		);
		expect(max).toContain('Lucys Portmonnaie heimlich aus ihrer Jacke');
	});

	it('carries the group scene’s playerRole and names the others present', () => {
		const prompt = buildScenePersonaPrompt(contextWith(), MAX_ID, SCENE_GROUP_CONFRONTATION, {
			kind: 'group',
			participantIds: [LUCY_ID, MAX_ID, SABINE_ID]
		});
		expect(prompt).toContain('confront-max-with-evidence');
		expect(prompt).toContain('Gruppenchat mit: Lucy, Sabine');
	});

	it('moves an idle scene’s goals from "pursuing" to "already resolved" instead of dropping them', () => {
		const active = buildScenePersonaPrompt(
			contextWith(),
			LUCY_ID,
			SCENE_LUCY_INTRO,
			soloWith(LUCY_ID)
		);
		expect(active).toContain('Worauf du in diesem Gespräch hinauswillst');
		expect(active).toContain('name-max-and-sabine-as-witnesses');
		expect(active).not.toContain('Das ist zwischen euch bereits geklärt');

		const idle = buildScenePersonaPrompt(
			contextWith(),
			LUCY_ID,
			SCENE_LUCY_INTRO,
			soloWith(LUCY_ID),
			{ idle: true }
		);
		expect(idle).not.toContain('Worauf du in diesem Gespräch hinauswillst');
		expect(idle).toContain('Das ist zwischen euch bereits geklärt');
		expect(idle).toContain('name-max-and-sabine-as-witnesses');
	});

	it('drops a group scene’s playerRole once idle, without losing canon facts', () => {
		const idle = buildScenePersonaPrompt(
			contextWith(),
			MAX_ID,
			SCENE_GROUP_CONFRONTATION,
			{ kind: 'group', participantIds: [LUCY_ID, MAX_ID, SABINE_ID] },
			{ idle: true }
		);
		expect(idle).not.toContain('confront-max-with-evidence');
		expect(idle).toContain('Das ist zwischen euch bereits geklärt');
	});

	it('trims Max’ facts to this scene’s relevantFactIds (#79)', () => {
		// The questioning scene's authored relevantFactIds keeps club-theft/cloakroom/barkeeper —
		// the club name, theft date and lucy-max-sabine friendship facts are known to Max but not
		// listed, so they must not reach the model here.
		const prompt = buildScenePersonaPrompt(
			contextWith(),
			MAX_ID,
			SCENE_MAX_QUESTIONING_1,
			soloWith(MAX_ID)
		);
		expect(prompt).toContain('Barkeeper');
		expect(prompt).toContain('unbesetzt');
		expect(prompt).not.toContain('Bahnhofsviertel');
		expect(prompt).not.toContain('Samstag auf Sonntag');
		expect(prompt).not.toContain('Schulzeit');
	});
});

describe('scene-level relevantFactIds/relevantSecretIds filtering (#79)', () => {
	const character: EffectiveCharacterState = {
		id: 'char-1',
		displayName: 'Testchar',
		knowledge: { publicFacts: ['fact:a', 'fact:b'], secrets: ['secret:a'] },
		availability: { state: 'visible' },
		relationships: {}
	};

	const facts = [
		{ id: 'fact:a', type: 'fact' as const, statement: 'Fact A statement.' },
		{ id: 'fact:b', type: 'fact' as const, statement: 'Fact B statement.' }
	];
	const secrets = [
		{
			id: 'secret:a',
			type: 'secret' as const,
			label: 'Secret A label',
			statement: 'Secret A statement.',
			heldBy: [],
			revealCondition: 'flag:x'
		}
	];

	function contextForScene(scene: Record<string, unknown> & { id: string }): PersonaContext {
		return {
			bundle: { graph: { nodes: [scene] }, facts, secrets } as unknown as StoryBundle,
			cast: [character],
			isConditionMet: () => false,
			storyTitle: 'Test Story',
			playerName: 'Player'
		};
	}

	const solo = { kind: 'solo' as const, participantIds: ['char-1'] };

	it('includes every known fact/secret when the lists are absent (back-compat)', () => {
		const scene = { id: 's1', type: 'chat-scene', goals: [] };
		const prompt = buildScenePersonaPrompt(contextForScene(scene), 'char-1', 's1', solo);
		expect(prompt).toContain('Fact A statement.');
		expect(prompt).toContain('Fact B statement.');
		expect(prompt).toContain('Secret A statement.');
	});

	it('excludes facts/secrets not named in relevantFactIds/relevantSecretIds when set', () => {
		const scene = {
			id: 's1',
			type: 'chat-scene',
			goals: [],
			relevantFactIds: ['fact:a'],
			relevantSecretIds: []
		};
		const prompt = buildScenePersonaPrompt(contextForScene(scene), 'char-1', 's1', solo);
		expect(prompt).toContain('Fact A statement.');
		expect(prompt).not.toContain('Fact B statement.');
		expect(prompt).not.toContain('Secret A statement.');
	});
});
