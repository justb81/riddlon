/**
 * Full-depth "Lucys Portmonnaie" fixture covering all 15 steps of docs/concept.md §7's
 * reference walkthrough — the acceptance-test fixture for the engine issues (#7 scenes,
 * #8 clues/contradictions, #9 delayed events). Reuses the shared PACKAGE_ID/LUCY_ID/
 * MAX_ID/SABINE_ID constants from the minimal `lucys-portmonnaie.ts` fixture (unchanged,
 * still used by content/storage/characters specs) so both fixtures describe the same
 * story/cast; this one just has the real depth of graph #19 will eventually ship as an
 * actual `.zip`. Hans (§7 step 9) stays a mentioned-but-offscreen source, per issue #19 —
 * no character file, only referenced from clue/secret content.
 */

import { LUCY_ID, MAX_ID, PACKAGE_ID, SABINE_ID } from './lucys-portmonnaie.js';

export { LUCY_ID, MAX_ID, PACKAGE_ID, SABINE_ID };

export const SCENE_LUCY_INTRO = 'a0000000-0000-4000-8000-000000000001';
export const SCENE_MAX_QUESTIONING_1 = 'a0000000-0000-4000-8000-000000000002';
export const SCENE_SABINE_QUESTIONING_1 = 'a0000000-0000-4000-8000-000000000003';
export const SCENE_REPORT_1 = 'a0000000-0000-4000-8000-000000000004';
export const SCENE_LUCY_SUSPICION = 'a0000000-0000-4000-8000-000000000005';
export const SCENE_MAX_QUESTIONING_2 = 'a0000000-0000-4000-8000-000000000006';
export const SCENE_SABINE_QUESTIONING_2 = 'a0000000-0000-4000-8000-000000000007';
export const SCENE_REPORT_2 = 'a0000000-0000-4000-8000-000000000008';
export const SCENE_GROUP_CONFRONTATION = 'a0000000-0000-4000-8000-000000000009';

const ACHIEVEMENT_CASE_SOLVED = 'a0000000-0000-4000-8000-000000000010';
const ACHIEVEMENT_ALL_CLUES = 'a0000000-0000-4000-8000-000000000011';
const ACHIEVEMENT_NO_FALSE_ACCUSATION = 'a0000000-0000-4000-8000-000000000012';

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
		world: ['world/clues.json', 'world/facts.json', 'world/secrets.json'],
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
				// §7 step 6: Max/Sabine only appear as contacts once Lucy has named them.
				knowledge: { publicFacts: ['fact:club-theft'], secrets: [] },
				availability: { initialState: 'hidden', unlockCondition: 'flag:witnesses-named' },
				relationships: { [LUCY_ID]: 'friend', [SABINE_ID]: 'friend' }
			},
			{
				characterRef: SABINE_ID,
				roleInStory: 'witness',
				knowledge: { publicFacts: ['fact:club-theft'], secrets: [] },
				availability: { initialState: 'hidden', unlockCondition: 'flag:witnesses-named' },
				relationships: { [LUCY_ID]: 'friend', [MAX_ID]: 'friend' }
			}
		],
		achievements: [
			{ id: ACHIEVEMENT_CASE_SOLVED, label: 'Fall gelöst' },
			{ id: ACHIEVEMENT_ALL_CLUES, label: 'Alle Hinweise gefunden' },
			{ id: ACHIEVEMENT_NO_FALSE_ACCUSATION, label: 'Ohne Falschbeschuldigung gelöst' }
		],
		delayedEvents: [
			{
				id: 'event:lucy-followup',
				trigger: 'time-based',
				approxDelay: 'PT2H',
				condition: 'flag:report-to-lucy-done',
				// docs/concept.md §5.6's own example spells this "unlock-scene:scene-lucy-suspicion"
				// as a readable placeholder (§5.4's note: "in der Implementierung sind dies reale
				// UUIDv4-Werte") — sceneGraph.ts enforces real UUIDs for actual scene nodes, so the
				// action references SCENE_LUCY_SUSPICION's real id to stay functionally correct.
				action: `unlock-scene:${SCENE_LUCY_SUSPICION}`
			}
		]
	};
}

function graph() {
	return {
		nodes: [
			{
				id: SCENE_LUCY_INTRO,
				type: 'chat-scene',
				participants: [LUCY_ID],
				goals: ['introduce-lucy', 'request-help'],
				entryConditions: [],
				exitConditions: ['flag:witnesses-named'],
				revealables: ['fact:club-theft'],
				next: [
					{ target: SCENE_MAX_QUESTIONING_1, when: ['flag:witnesses-named'] },
					{ target: SCENE_SABINE_QUESTIONING_1, when: ['flag:witnesses-named'] }
				]
			},
			{
				id: SCENE_MAX_QUESTIONING_1,
				type: 'chat-scene',
				participants: [MAX_ID],
				goals: ['seed-timeline', 'seed-suspect-description'],
				entryConditions: ['flag:witnesses-named'],
				exitConditions: ['flag:max-questioned'],
				revealables: ['clue:time-window', 'clue:stolen-item', 'clue:suspect-description'],
				next: [{ target: SCENE_REPORT_1, when: ['flag:max-questioned', 'flag:sabine-questioned'] }]
			},
			{
				id: SCENE_SABINE_QUESTIONING_1,
				type: 'chat-scene',
				participants: [SABINE_ID],
				goals: ['seed-timeline', 'seed-suspect-description'],
				entryConditions: ['flag:witnesses-named'],
				exitConditions: ['flag:sabine-questioned'],
				revealables: ['clue:time-window', 'clue:stolen-item', 'clue:suspect-description'],
				next: [{ target: SCENE_REPORT_1, when: ['flag:max-questioned', 'flag:sabine-questioned'] }]
			},
			{
				id: SCENE_REPORT_1,
				type: 'chat-scene',
				participants: [LUCY_ID],
				goals: ['report-findings'],
				// The #8 evidence gate: both witnesses questioned AND ≥2 independent sources
				// have confirmed the time-window clue (§7 step 7's "beide Quellen nötig").
				entryConditions: [
					'flag:max-questioned',
					'flag:sabine-questioned',
					'clue-confirmed:clue:time-window:2'
				],
				exitConditions: ['flag:report-to-lucy-done'],
				revealables: [],
				next: []
			},
			{
				id: SCENE_LUCY_SUSPICION,
				type: 'chat-scene',
				participants: [LUCY_ID],
				goals: ['raise-hans-suspicion'],
				// Never organically true — this scene unlocks exclusively via the delayed
				// event's `unlock-scene:` action (§7 step 9), not through ordinary flag flow.
				entryConditions: ['flag:lucy-suspicion-only-via-delayed-event'],
				exitConditions: ['flag:suspicion-relayed'],
				revealables: ['secret:hans-tip'],
				next: [
					{ target: SCENE_MAX_QUESTIONING_2, when: ['flag:suspicion-relayed'] },
					{ target: SCENE_SABINE_QUESTIONING_2, when: ['flag:suspicion-relayed'] }
				]
			},
			{
				id: SCENE_MAX_QUESTIONING_2,
				type: 'chat-scene',
				participants: [MAX_ID],
				goals: ['confront-with-hans-claim'],
				entryConditions: ['flag:suspicion-relayed'],
				exitConditions: ['flag:max-denies-hans-claim'],
				revealables: ['clue:max-whereabouts'],
				next: [
					{
						target: SCENE_REPORT_2,
						when: ['flag:max-denies-hans-claim', 'flag:sabine-confirms-hans-claim']
					}
				]
			},
			{
				id: SCENE_SABINE_QUESTIONING_2,
				type: 'chat-scene',
				participants: [SABINE_ID],
				goals: ['confirm-hans-claim'],
				entryConditions: ['flag:suspicion-relayed'],
				exitConditions: ['flag:sabine-confirms-hans-claim'],
				revealables: ['clue:max-whereabouts'],
				next: [
					{
						target: SCENE_REPORT_2,
						when: ['flag:max-denies-hans-claim', 'flag:sabine-confirms-hans-claim']
					}
				]
			},
			{
				id: SCENE_REPORT_2,
				type: 'chat-scene',
				participants: [LUCY_ID],
				goals: ['report-findings'],
				entryConditions: ['flag:max-denies-hans-claim', 'flag:sabine-confirms-hans-claim'],
				exitConditions: ['flag:hans-info-confirmed'],
				revealables: [],
				next: []
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

/**
 * §5.5's `confirmedBy`/`conflicting` are DECLARED package metadata (an author's
 * design-time expectation of how the case plays out) — the engine's actual runtime clue
 * state (`EngineState.clues`) starts empty regardless (see `createInitialState`) and is
 * built up live via `recordClueClaim` as the player actually questions each witness.
 */
function clues() {
	return [
		{
			id: 'clue:time-window',
			type: 'clue',
			label: 'Ungefähre Tatzeit',
			confirmedBy: [MAX_ID, SABINE_ID],
			conflicting: true
		},
		{
			id: 'clue:stolen-item',
			type: 'clue',
			label: 'Gestohlener Gegenstand',
			confirmedBy: [MAX_ID, SABINE_ID],
			conflicting: false
		},
		{
			id: 'clue:suspect-description',
			type: 'clue',
			label: 'Täterbeschreibung',
			confirmedBy: [MAX_ID, SABINE_ID],
			conflicting: false
		},
		{
			id: 'clue:max-whereabouts',
			type: 'clue',
			label: "Max' Aufenthaltsort laut Hans",
			confirmedBy: [MAX_ID, SABINE_ID],
			conflicting: true
		}
	];
}

function facts() {
	return [
		{
			id: 'fact:club-theft',
			type: 'fact',
			statement: 'Lucy wurde im Club ihr Portmonnaie gestohlen.'
		}
	];
}

function secrets() {
	return [
		{
			id: 'secret:hans-tip',
			type: 'secret',
			label: 'Hans belastet Max',
			heldBy: [LUCY_ID],
			revealCondition: 'flag:report-to-lucy-done'
		}
	];
}

/** A well-formed, full-depth package reproducing all 15 steps of docs/concept.md §7. */
export function buildWalkthroughPackageFiles(): Record<string, unknown> {
	return {
		'manifest.json': manifest(),
		[`characters/${LUCY_ID}.character.json`]: characterFile(LUCY_ID, 'lucy', 'Lucy'),
		[`characters/${MAX_ID}.character.json`]: characterFile(MAX_ID, 'max', 'Max'),
		[`characters/${SABINE_ID}.character.json`]: characterFile(SABINE_ID, 'sabine', 'Sabine'),
		'story/story.json': story(),
		'story/graph.json': graph(),
		'world/clues.json': clues(),
		'world/facts.json': facts(),
		'world/secrets.json': secrets()
	};
}
