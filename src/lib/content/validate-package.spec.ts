import { describe, expect, it } from 'vitest';
import { validatePackage } from './validate-package.js';
import type { Manifest, Story, StoryGraph } from './schemas/index.js';
import {
	buildValidPackageFiles,
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
			heldBy: [MAX_ID],
			revealCondition: 'flag:report-to-lucy-done'
		}
	];
	return next;
}

describe('validatePackage', () => {
	it('accepts a well-formed package matching the §5.2 example shape with no errors', () => {
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
