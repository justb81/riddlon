/**
 * Bridges the milestone/achievement display the "Storyübersicht" screen (#17) needs onto
 * real `$lib/engine` state, using only the condition vocabulary the engine already
 * evaluates (`clue-confirmed:`, `outcome-reached:`, `flag:`, …) — no engine changes.
 *
 * The package format's `achievements[]` (`content/schemas/story.ts`) is still id/label
 * only — issue #32 tracks adding real unlock conditions to the schema itself. Until then,
 * the mapping from "this reference story's achievement" to "the condition that earns it"
 * lives here, at the display layer, rather than being invented as engine behavior.
 */

import {
	buildEvaluationContext,
	evaluateAll,
	evaluateCondition,
	type EngineState
} from '$lib/engine/index.js';
import type { StoryBundle } from '$lib/content/index.js';
import {
	ACH_ALL_CLUES,
	ACH_CASE_SOLVED,
	ACH_NO_FALSE_ACCUSATION,
	CLUE_MAX_WHEREABOUTS,
	CLUE_TIME_WINDOW,
	FLAG_EVIDENCE_PRESENTED,
	FLAG_FALSE_ACCUSATION,
	OUTCOME_MAX_CONFESSES
} from './reference-package.js';

export interface MilestoneDef {
	id: string;
	title: string;
	desc: string;
	condition: string;
	badge?: { title: string; glyph: string; desc: string };
}

export interface AchievementDef {
	id: string;
	glyph: string;
	title: string;
	conditions: string[];
}

export const MILESTONE_DEFS: MilestoneDef[] = [
	{
		id: 'm1',
		title: 'Unbekannte Nummer',
		desc: 'Erster Kontakt angenommen, statt zu blocken.',
		condition: 'story-start'
	},
	{
		id: 'm2',
		title: 'Zwei Quellen',
		desc: 'Max und Sabine unabhängig voneinander befragt.',
		condition: `clue-confirmed:${CLUE_TIME_WINDOW}:2`,
		badge: {
			title: 'Doppelt geprüft',
			glyph: 'II',
			desc: 'Jeden Hinweis von zwei Seiten bestätigt.'
		}
	},
	{
		id: 'm3',
		title: 'Widerspruch entdeckt',
		desc: 'Die Aussagen zur Tatzeit passen nicht zusammen — du hast es bemerkt.',
		condition: `clue-confirmed:${CLUE_TIME_WINDOW}:2`,
		badge: {
			title: 'Erster Widerspruch',
			glyph: '!',
			desc: 'Zwei Aussagen gegeneinander gestellt.'
		}
	},
	{
		id: 'm4',
		title: "Hans' Hinweis",
		desc: 'Lucys Nachfrage an der Garderobe brachte den entscheidenden Zeugen.',
		// A single claim is enough here — Lucy relaying what Hans told her, before Max's own
		// (conflicting) account exists yet. The conflict itself is `clue-confirmed:...:2`,
		// reached once the group scene's seed reveals Max's side (see `game.svelte.ts`).
		condition: `clue-known:${CLUE_MAX_WHEREABOUTS}`
	},
	{
		id: 'm5',
		title: 'Konfrontation',
		desc: 'Max im Gruppenchat mit der vollständigen Beweislage stellen.',
		condition: FLAG_EVIDENCE_PRESENTED
	},
	{
		id: 'm6',
		title: 'Fall gelöst',
		desc: 'Geständnis erreicht, ohne eine falsche Beschuldigung auszusprechen.',
		condition: `outcome-reached:${OUTCOME_MAX_CONFESSES}`
	}
];

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
	{
		id: ACH_CASE_SOLVED,
		glyph: '✓',
		title: 'Fall gelöst',
		conditions: [`outcome-reached:${OUTCOME_MAX_CONFESSES}`]
	},
	{
		id: ACH_ALL_CLUES,
		glyph: '◆',
		title: 'Alle Hinweise gefunden',
		conditions: [`clue-known:${CLUE_TIME_WINDOW}`, `clue-known:${CLUE_MAX_WHEREABOUTS}`]
	},
	{
		id: ACH_NO_FALSE_ACCUSATION,
		glyph: '◇',
		title: 'Ohne Falschbeschuldigung',
		conditions: [`outcome-reached:${OUTCOME_MAX_CONFESSES}`, `not:${FLAG_FALSE_ACCUSATION}`]
	}
];

export function isMilestoneDone(
	def: MilestoneDef,
	state: EngineState,
	bundle: StoryBundle
): boolean {
	return evaluateCondition(def.condition, buildEvaluationContext(state, bundle));
}

export function isAchievementEarned(
	def: AchievementDef,
	state: EngineState,
	bundle: StoryBundle
): boolean {
	return evaluateAll(def.conditions, buildEvaluationContext(state, bundle)).value;
}
