import { describe, expect, it } from 'vitest';
import { validatePackage } from './validate-package.js';
import type { Manifest, Story, StoryGraph } from './schemas/index.js';
import {
	buildValidPackageFiles,
	LUCY_ID,
	MAX_ID,
	SABINE_ID,
	withIncompatibleMinPlayerVersion,
	withMissingCharacterFile,
	withNonUuidCharacterRef
} from './__fixtures__/lucys-portmonnaie.js';

/** Adds world/facts.json + world/secrets.json to the shared fixture, registered in the manifest. */
function withFactsAndSecrets(files: Record<string, unknown>): Record<string, unknown> {
	const next = structuredClone(files);
	const manifest = next['manifest.json'] as Manifest;
	manifest.world = [...manifest.world, 'world/facts.json', 'world/secrets.json'];
	next['world/facts.json'] = [
		{ id: 'fact:club-theft', type: 'fact', statement: 'Ein Portmonnaie wurde im Club gestohlen.' }
	];
	next['world/secrets.json'] = [
		{
			id: 'secret:hans-tip',
			type: 'secret',
			label: 'Hans belastet Max',
			statement: 'Hans hat gesehen, wie Max kurz vor Mitternacht allein an der Garderobe stand.',
			heldBy: [MAX_ID],
			revealCondition: 'flag:report-to-lucy-done'
		}
	];
	return next;
}

describe('validatePackage', () => {
	it('accepts a well-formed package matching the §8.1.2 example shape with no errors', () => {
		const result = validatePackage(buildValidPackageFiles());
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it('rejects a non-UUID characterRef with a specific SCHEMA_ERROR', () => {
		const result = validatePackage(withNonUuidCharacterRef(buildValidPackageFiles()));
		expect(result.valid).toBe(false);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				code: 'SCHEMA_ERROR',
				path: expect.stringContaining('characterRef')
			})
		);
	});

	it('rejects a missing referenced character file with a specific MISSING_FILE error', () => {
		const result = validatePackage(withMissingCharacterFile(buildValidPackageFiles()));
		expect(result.valid).toBe(false);
		expect(result.errors).toContainEqual(
			expect.objectContaining({ code: 'MISSING_FILE', message: expect.stringContaining('missing') })
		);
	});

	it('rejects a formatVersion/minPlayerVersion above the running player with PLAYER_TOO_OLD', () => {
		const result = validatePackage(withIncompatibleMinPlayerVersion(buildValidPackageFiles()));
		expect(result.valid).toBe(false);
		expect(result.errors).toContainEqual(expect.objectContaining({ code: 'PLAYER_TOO_OLD' }));
	});

	it('rejects a well-formed UUID ref with no matching character file as DANGLING_REFERENCE', () => {
		const files = buildValidPackageFiles();
		const story = files['story/story.json'] as Story;
		story.castBindings[1].characterRef = '11111111-1111-4111-8111-111111111111';
		const result = validatePackage(files);
		expect(result.valid).toBe(false);
		expect(result.errors).toContainEqual(expect.objectContaining({ code: 'DANGLING_REFERENCE' }));
	});

	it('returns a single MISSING_FILE error when manifest.json itself is absent', () => {
		const result = validatePackage({});
		expect(result).toEqual({
			valid: false,
			errors: [expect.objectContaining({ code: 'MISSING_FILE', path: 'manifest.json' })]
		});
	});

	it('detects duplicate scene ids across the graph', () => {
		const files = buildValidPackageFiles();
		const graph = files['story/graph.json'] as StoryGraph;
		graph.nodes[1].id = graph.nodes[0].id;
		const result = validatePackage(files);
		expect(result.errors).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_ID' }));
	});

	it('parses world/facts.json and world/secrets.json and returns them on the result', () => {
		const result = validatePackage(withFactsAndSecrets(buildValidPackageFiles()));
		expect(result.valid).toBe(true);
		expect(result.facts).toEqual([
			{ id: 'fact:club-theft', type: 'fact', statement: 'Ein Portmonnaie wurde im Club gestohlen.' }
		]);
		expect(result.secrets).toEqual([
			{
				id: 'secret:hans-tip',
				type: 'secret',
				label: 'Hans belastet Max',
				statement: 'Hans hat gesehen, wie Max kurz vor Mitternacht allein an der Garderobe stand.',
				heldBy: [MAX_ID],
				revealCondition: 'flag:report-to-lucy-done'
			}
		]);
		expect(result.clues).toEqual([
			{
				id: 'clue:time-window',
				type: 'clue',
				label: 'Ungefähre Tatzeit',
				confirmedBy: [MAX_ID, SABINE_ID],
				conflicting: true
			}
		]);
		expect(result.story).toBeDefined();
		expect(result.graph).toBeDefined();
	});

	it('returns the parsed character identities for the installer to hand off to #characters', () => {
		const result = validatePackage(buildValidPackageFiles());
		expect(result.characters).toHaveLength(3);
		expect(result.characters?.map((c) => c.id).sort()).toEqual([LUCY_ID, MAX_ID, SABINE_ID].sort());
	});

	it('rejects a secret.heldBy referencing a character with no shipped character file', () => {
		const files = withFactsAndSecrets(buildValidPackageFiles());
		const secrets = files['world/secrets.json'] as { heldBy: string[] }[];
		secrets[0].heldBy = ['11111111-1111-4111-8111-111111111111'];
		const result = validatePackage(files);
		expect(result.valid).toBe(false);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				code: 'DANGLING_REFERENCE',
				path: expect.stringContaining('heldBy')
			})
		);
	});

	it('detects duplicate fact ids', () => {
		const files = withFactsAndSecrets(buildValidPackageFiles());
		const facts = files['world/facts.json'] as { id: string }[];
		facts.push({ ...facts[0] });
		const result = validatePackage(files);
		expect(result.errors).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_ID' }));
	});
});

/**
 * Format 1.1.0 additions (#30, #32, #53, #55). Everything here is optional and defaulted, so the
 * first assertion is the one that matters most: the 1.0.0 fixture above must still validate
 * untouched.
 */
describe('validatePackage — format 1.1.0 fields', () => {
	function sceneIds(files: Record<string, unknown>): string[] {
		return (files['story/graph.json'] as StoryGraph).nodes.map((node) => node.id);
	}

	it('defaults the new optional fields, so a 1.0.0 package keeps validating', () => {
		const result = validatePackage(buildValidPackageFiles());
		expect(result.valid).toBe(true);
		expect(result.manifest?.tags).toEqual([]);
		expect(result.story?.seedChats).toEqual([]);
	});

	it('accepts manifest tags, achievement conditions, seed chats and authored outcomes', () => {
		const files = structuredClone(buildValidPackageFiles());
		const [maxScene] = sceneIds(files);
		(files['manifest.json'] as Manifest).tags = ['krimi', 'freundschaft'];
		const story = files['story/story.json'] as Story;
		story.achievements = [
			{
				id: '5f83e807-42fc-41c0-b2e7-1d70a550f568',
				label: 'Fall gelöst',
				conditions: ['outcome-reached:max-confesses', 'clue-known:clue:time-window']
			}
		];
		story.seedChats = [
			{
				sceneRef: maxScene,
				messages: [
					{ from: MAX_ID, text: 'Alles gut bei dir?', offset: 'P2D' },
					{ from: 'me', text: 'Ja, alles gut.', offset: 'P2D' }
				]
			}
		];

		const result = validatePackage(files);
		expect(result.errors).toEqual([]);
		expect(result.manifest?.tags).toEqual(['krimi', 'freundschaft']);
		expect(result.story?.achievements[0].conditions).toHaveLength(2);
		expect(result.story?.seedChats[0].messages).toHaveLength(2);
	});

	it('rejects an achievement condition naming an entity the package never declares', () => {
		const files = structuredClone(buildValidPackageFiles());
		const story = files['story/story.json'] as Story;
		story.achievements = [
			{
				id: '5f83e807-42fc-41c0-b2e7-1d70a550f568',
				label: 'Alle Hinweise gefunden',
				// The clue exists; the outcome does not.
				conditions: ['clue-known:clue:time-window', 'not:outcome-reached:sabine-confesses']
			}
		];

		const result = validatePackage(files);
		expect(result.valid).toBe(false);
		expect(result.errors).toEqual([
			expect.objectContaining({
				code: 'DANGLING_REFERENCE',
				path: 'story/story.json#/achievements/0/conditions/1'
			})
		]);
	});

	it('reports a duplicate achievement id', () => {
		const files = structuredClone(buildValidPackageFiles());
		const story = files['story/story.json'] as Story;
		const id = '5f83e807-42fc-41c0-b2e7-1d70a550f568';
		story.achievements = [
			{ id, label: 'Fall gelöst', conditions: [] },
			{ id, label: 'Nochmal gelöst', conditions: [] }
		];

		const result = validatePackage(files);
		expect(result.errors).toEqual([
			expect.objectContaining({ code: 'DUPLICATE_ID', path: 'story/story.json#/achievements/1/id' })
		]);
	});

	it('rejects a seed chat on an unknown scene, and one whose speaker is not in the scene', () => {
		const files = structuredClone(buildValidPackageFiles());
		const [maxScene] = sceneIds(files);
		const story = files['story/story.json'] as Story;
		story.seedChats = [
			{
				sceneRef: '00000000-0000-4000-8000-000000000000',
				messages: [{ from: MAX_ID, text: 'Hallo?', offset: 'PT10M' }]
			},
			{
				// SABINE is not a participant of Max's scene — the history would show up in a thread
				// she has nothing to do with.
				sceneRef: maxScene,
				messages: [{ from: SABINE_ID, text: 'Hallo?', offset: 'PT10M' }]
			}
		];

		const result = validatePackage(files);
		expect(result.valid).toBe(false);
		expect(result.errors.map((error) => error.path)).toEqual([
			'story/story.json#/seedChats/0/sceneRef',
			'story/story.json#/seedChats/1/messages/0/from'
		]);
	});

	it('reports two seed chats for one scene, which would silently concatenate', () => {
		const files = structuredClone(buildValidPackageFiles());
		const [maxScene] = sceneIds(files);
		const story = files['story/story.json'] as Story;
		story.seedChats = [
			{ sceneRef: maxScene, messages: [{ from: MAX_ID, text: 'Eins', offset: 'PT10M' }] },
			{ sceneRef: maxScene, messages: [{ from: MAX_ID, text: 'Zwei', offset: 'PT5M' }] }
		];

		const result = validatePackage(files);
		expect(result.errors).toEqual([
			expect.objectContaining({
				code: 'DUPLICATE_ID',
				path: 'story/story.json#/seedChats/1/sceneRef'
			})
		]);
	});
});
