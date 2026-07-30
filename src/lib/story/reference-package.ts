/**
 * Real, schema-valid `content/` package for the reference story "Lucys Portmonnaie" —
 * installed through the actual ZIP pipeline (`bootstrap.ts`) so the chat UI is driven by a
 * real `StoryEngine` instead of `game.svelte.ts`'s old scripted timers.
 *
 * This is a minimal engine-consumable slice of the story graph, not the full 15-step
 * walkthrough from docs/concept.md §7 — authoring that narrative in full is #19's job. The
 * authored dialogue itself still lives in `lucys-portmonnaie.ts` (untouched); this file only
 * adds the real scenes/clues/cast/achievements needed so that dialogue's *consequences*
 * (contradiction detection, character unlocks, milestones, the case-solved outcome) are
 * produced by `$lib/engine` and persisted via `$lib/storage`, not by ad hoc counters.
 */

export const PACKAGE_ID = 'a10a1000-0000-4000-8000-000000000001';
export const LUCY_ID = 'a10a1000-0000-4000-8000-000000000002';
export const MAX_ID = 'a10a1000-0000-4000-8000-000000000003';
export const SABINE_ID = 'a10a1000-0000-4000-8000-000000000004';

export const SCENE_LUCY = 'a10a1000-0000-4000-8000-000000000005';
export const SCENE_GROUP = 'a10a1000-0000-4000-8000-000000000006';

export const ACH_CASE_SOLVED = 'a10a1000-0000-4000-8000-000000000007';
export const ACH_ALL_CLUES = 'a10a1000-0000-4000-8000-000000000008';
export const ACH_NO_FALSE_ACCUSATION = 'a10a1000-0000-4000-8000-000000000009';

export const CLUE_TIME_WINDOW = 'clue:time-window';
export const CLUE_MAX_WHEREABOUTS = 'clue:max-whereabouts';

/** The one place a claim's `characterId` (a UUID) maps to a display name — #35. */
export const CHARACTER_DISPLAY_NAMES: Record<string, string> = {
	[LUCY_ID]: 'Lucy',
	[MAX_ID]: 'Max',
	[SABINE_ID]: 'Sabine'
};

export const FLAG_LUCY_BRIEFED = 'flag:lucy-briefed';
export const FLAG_EVIDENCE_PRESENTED = 'flag:evidence-presented';
export const FLAG_FALSE_ACCUSATION = 'flag:false-accusation';
export const OUTCOME_MAX_CONFESSES = 'max-confesses';
export const EVENT_LUCY_NUDGE = 'event:lucy-nudge';

function characterFile(id: string, slug: string, displayName: string, personality: string) {
	return {
		id,
		slug,
		displayName,
		voiceStyle: 'informell, jung',
		corePersonality: personality,
		originPackage: PACKAGE_ID,
		shareable: true
	};
}

/** Builds the package's JSON files, in the exact shape `validatePackage()` expects. */
export function buildReferencePackageFiles(): Record<string, unknown> {
	return {
		'manifest.json': {
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
		},
		[`characters/${LUCY_ID}.character.json`]: characterFile(
			LUCY_ID,
			'lucy',
			'Lucy',
			'warmherzig, aufgeregt, misstrauisch gegenüber niemandem außer den Verdächtigen'
		),
		[`characters/${MAX_ID}.character.json`]: characterFile(
			MAX_ID,
			'max',
			'Max',
			'impulsiv, loyal, wird schnell defensiv'
		),
		[`characters/${SABINE_ID}.character.json`]: characterFile(
			SABINE_ID,
			'sabine',
			'Sabine',
			'ruhig, scharfzüngig, hält an ihrer Version fest'
		),
		'story/story.json': {
			castBindings: [
				{
					characterRef: LUCY_ID,
					roleInStory: 'quest-giver',
					knowledge: { publicFacts: [], secrets: [] },
					availability: { initialState: 'visible' },
					relationships: { [MAX_ID]: 'friend', [SABINE_ID]: 'friend' }
				},
				{
					characterRef: MAX_ID,
					roleInStory: 'suspect-witness',
					knowledge: { publicFacts: [], secrets: [] },
					availability: { initialState: 'hidden', unlockCondition: FLAG_LUCY_BRIEFED },
					relationships: { [LUCY_ID]: 'friend', [SABINE_ID]: 'friend' }
				},
				{
					characterRef: SABINE_ID,
					roleInStory: 'witness',
					knowledge: { publicFacts: [], secrets: [] },
					availability: { initialState: 'hidden', unlockCondition: FLAG_LUCY_BRIEFED },
					relationships: { [LUCY_ID]: 'friend', [MAX_ID]: 'friend' }
				}
			],
			achievements: [
				{ id: ACH_CASE_SOLVED, label: 'Fall gelöst' },
				{ id: ACH_ALL_CLUES, label: 'Alle Hinweise gefunden' },
				{ id: ACH_NO_FALSE_ACCUSATION, label: 'Ohne Falschbeschuldigung' }
			],
			delayedEvents: [
				{
					id: EVENT_LUCY_NUDGE,
					trigger: 'time-based',
					approxDelay: 'PT2H',
					condition: FLAG_LUCY_BRIEFED,
					action: 'set-flag:flag:lucy-nudge-sent'
				}
			]
		},
		'story/graph.json': {
			nodes: [
				{
					id: SCENE_LUCY,
					type: 'chat-scene',
					participants: [LUCY_ID],
					goals: ['open-as-unknown-contact', 'share-contradiction'],
					entryConditions: [],
					exitConditions: [FLAG_LUCY_BRIEFED],
					revealables: [CLUE_TIME_WINDOW],
					next: [{ target: SCENE_GROUP, when: [FLAG_LUCY_BRIEFED] }]
				},
				{
					id: SCENE_GROUP,
					type: 'group-chat-scene',
					participants: [LUCY_ID, MAX_ID, SABINE_ID],
					goals: ['resolve-case'],
					entryConditions: [FLAG_LUCY_BRIEFED],
					exitConditions: [],
					revealables: [CLUE_MAX_WHEREABOUTS],
					playerRole: 'confront-max-with-evidence',
					outcomes: [{ id: OUTCOME_MAX_CONFESSES, condition: FLAG_EVIDENCE_PRESENTED }]
				}
			]
		},
		'world/clues.json': [
			{
				id: CLUE_TIME_WINDOW,
				type: 'clue',
				label: 'Ungefähre Tatzeit',
				confirmedBy: [MAX_ID, SABINE_ID],
				conflicting: true
			},
			{
				id: CLUE_MAX_WHEREABOUTS,
				type: 'clue',
				label: "Max' Aufenthaltsort",
				confirmedBy: [MAX_ID, LUCY_ID],
				conflicting: true
			}
		]
	};
}
