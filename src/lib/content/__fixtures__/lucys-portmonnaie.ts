/**
 * Minimal hand-built fixture package reusing docs/concept.md's actual example UUIDs for
 * Lucy/Max/Sabine and the package id. Shared by content/, storage/, and characters/ test suites.
 */

export const PACKAGE_ID = '7e9c1a2b-3d4e-4f5a-8b6c-9d0e1f2a3b4c';
export const LUCY_ID = '3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f';
export const MAX_ID = '8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e';
export const SABINE_ID = 'c1a4e7f2-9d3b-4f6a-8e1c-5b7d9f0a2c4e';

const SCENE_MAX_QUESTIONING = 'b2e4f6a8-1c3d-4e5f-9a7b-0c1d2e3f4a5b';
const SCENE_REPORT_TO_LUCY = 'a1b2c3d4-1c3d-4e5f-9a7b-0c1d2e3f4a5c';
const SCENE_GROUP_CONFRONTATION = 'd3e4f5a6-1c3d-4e5f-9a7b-0c1d2e3f4a5d';

function characterFile(id: string, slug: string, displayName: string) {
	return {
		id,
		slug,
		displayName,
		avatar: `assets/avatars/${slug}.png`,
		voiceStyle: 'informell, jung, leicht gestresst',
		corePersonality: 'impulsiv, loyal, misstrauisch gegenüber Autoritäten',
		originPackage: PACKAGE_ID,
		shareable: true
	};
}

function manifest() {
	return {
		format: 'chatstory-package',
		formatVersion: '1.0.0',
		id: PACKAGE_ID,
		title: 'Lucys Portmonnaie',
		version: '0.1.0',
		author: 'Riddlon Team',
		language: 'de',
		entryStory: 'story/story.json',
		entryGraph: 'story/graph.json',
		characters: [
			`characters/${LUCY_ID}.character.json`,
			`characters/${MAX_ID}.character.json`,
			`characters/${SABINE_ID}.character.json`
		],
		world: ['world/clues.json'],
		assetsBase: 'assets/',
		minPlayerVersion: '0.1.0',
		capabilities: ['local-llm', 'delayed-events', 'multi-character-chat', 'group-chat']
	};
}

function story() {
	return {
		castBindings: [
			{
				characterRef: LUCY_ID,
				roleInStory: 'quest-giver',
				knowledge: { publicFacts: ['fact:club-theft'], secrets: ['secret:hans-tip'] },
				availability: { initialState: 'visible' },
				relationships: { [MAX_ID]: 'friend', [SABINE_ID]: 'friend' }
			},
			{
				characterRef: MAX_ID,
				roleInStory: 'witness',
				knowledge: { publicFacts: ['fact:club-theft'], secrets: [] },
				availability: { initialState: 'hidden', unlockCondition: 'story-start' },
				relationships: { [LUCY_ID]: 'friend', [SABINE_ID]: 'friend' }
			},
			{
				characterRef: SABINE_ID,
				roleInStory: 'witness',
				knowledge: { publicFacts: ['fact:club-theft'], secrets: [] },
				availability: { initialState: 'hidden', unlockCondition: 'story-start' },
				relationships: { [LUCY_ID]: 'friend', [MAX_ID]: 'friend' }
			}
		],
		achievements: [],
		delayedEvents: [
			{
				id: 'event:lucy-followup',
				trigger: 'time-based',
				approxDelay: 'PT2H',
				condition: 'flag:report-to-lucy-done',
				action: 'unlock-scene:scene-lucy-suspicion'
			}
		]
	};
}

function graph() {
	return {
		nodes: [
			{
				id: SCENE_MAX_QUESTIONING,
				type: 'chat-scene',
				participants: [MAX_ID],
				goals: ['seed-timeline', 'seed-suspect-description'],
				entryConditions: ['flag:max-contact-unlocked'],
				exitConditions: ['flag:max-questioned'],
				revealables: ['clue:time-window', 'clue:suspect-description-a'],
				next: [{ target: SCENE_REPORT_TO_LUCY, when: ['flag:max-and-sabine-questioned'] }]
			},
			{
				id: SCENE_REPORT_TO_LUCY,
				type: 'chat-scene',
				participants: [LUCY_ID],
				goals: ['report-findings'],
				entryConditions: ['flag:max-and-sabine-questioned'],
				exitConditions: ['flag:report-to-lucy-done'],
				revealables: [],
				next: [{ target: SCENE_GROUP_CONFRONTATION, when: ['flag:hans-info-confirmed'] }]
			},
			{
				id: SCENE_GROUP_CONFRONTATION,
				type: 'group-chat-scene',
				participants: [LUCY_ID, MAX_ID, SABINE_ID],
				goals: ['resolve-case'],
				entryConditions: ['flag:hans-info-confirmed'],
				exitConditions: [],
				revealables: [],
				playerRole: 'confront-max-with-evidence',
				outcomes: [{ id: 'max-confesses', condition: 'flag:evidence-presented' }]
			}
		]
	};
}

function clues() {
	return [
		{
			id: 'clue:time-window',
			type: 'clue',
			label: 'Ungefähre Tatzeit',
			confirmedBy: [MAX_ID, SABINE_ID],
			conflicting: true
		}
	];
}

/** A well-formed package matching docs/concept.md §5.2's example shape. */
export function buildValidPackageFiles(): Record<string, unknown> {
	return {
		'manifest.json': manifest(),
		[`characters/${LUCY_ID}.character.json`]: characterFile(LUCY_ID, 'lucy', 'Lucy'),
		[`characters/${MAX_ID}.character.json`]: characterFile(MAX_ID, 'max', 'Max'),
		[`characters/${SABINE_ID}.character.json`]: characterFile(SABINE_ID, 'sabine', 'Sabine'),
		'story/story.json': story(),
		'story/graph.json': graph(),
		'world/clues.json': clues()
	};
}

/** Corrupts one castBindings[].characterRef to a non-UUID slug. */
export function withNonUuidCharacterRef(files: Record<string, unknown>): Record<string, unknown> {
	const next = structuredClone(files);
	const story = next['story/story.json'] as { castBindings: { characterRef: string }[] };
	story.castBindings[1].characterRef = 'max';
	return next;
}

/** Deletes one characters/*.character.json entry while the manifest still references it. */
export function withMissingCharacterFile(files: Record<string, unknown>): Record<string, unknown> {
	const next = { ...files };
	delete next[`characters/${SABINE_ID}.character.json`];
	return next;
}

/** Sets manifest.minPlayerVersion above the running player version. */
export function withIncompatibleMinPlayerVersion(
	files: Record<string, unknown>
): Record<string, unknown> {
	const next = structuredClone(files);
	const manifestFile = next['manifest.json'] as { minPlayerVersion: string };
	manifestFile.minPlayerVersion = '99.0.0';
	return next;
}
