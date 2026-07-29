/**
 * Mock installed-package content for the reference story "Lucys Portmonnaie"
 * (docs/concept.md §7). In the real system this would be loaded from an
 * imported story ZIP, not shipped as app source — hardcoded here to stand in
 * for that loader until the content-package format lands.
 */

import type {
	Achievement,
	ChatChip,
	Milestone,
	ReplyBeatMessage,
	SeedMessage,
	StoryCharacter
} from './types.js';

export const STORY_META = {
	id: 'lucys-portmonnaie',
	title: 'Lucys Portmonnaie',
	genre: 'Krimi',
	totalChapters: 5,
	currentChapter: 3,
	contactCount: 4,
	chapterTheme: 'DER WIDERSPRUCH',
	chapterGoal: 'Wer stand neben Lucys Jacke?',
	progressPercent: 62
};

export const LUCY_THREAD_META = { name: 'Lucy', lastOnline: '21:01' };
export const GROUP_THREAD_META = { name: 'Samstagnacht', memberSummary: 'Lucy, Max, Sabine, du' };

export const SIDE_THREAD_PREVIEWS: Record<'sabine' | 'max', string> = {
	sabine: 'Ich hab dir doch alles gesagt.',
	max: 'Kein Kommentar mehr dazu.'
};

export const CHARACTERS: Record<string, StoryCharacter> = {
	lucy: { id: 'lucy', name: 'Lucy', initial: 'L' },
	max: { id: 'max', name: 'Max', initial: 'M' },
	sabine: { id: 'sabine', name: 'Sabine', initial: 'S' }
};

export const LUCY_SEED: SeedMessage[] = [
	{ id: 's0', from: 'system', text: 'Kontakt „Unbekannt“ heißt jetzt Lucy' },
	{
		id: 's1',
		from: 'lucy',
		text: 'Warst du letzten Samstag im Club? Ich glaube, ich hab dich an der Bar gesehen.',
		time: '20:12'
	},
	{ id: 's2', from: 'me', text: 'Ja, war da. Wer bist du?', time: '20:19' },
	{
		id: 's3',
		from: 'lucy',
		text: 'Ich bin Lucy. Sorry für die Nummer aus dem Nichts. Mir wurde mein Portmonnaie geklaut und ich weiß nicht, wen ich sonst fragen soll.',
		time: '20:20'
	},
	{
		id: 's4',
		from: 'lucy',
		text: 'Max und Sabine waren auch da. Frag die mal, bitte. Ich kann gerade mit keinem von beiden reden.',
		time: '20:21'
	},
	{
		id: 's5',
		from: 'me',
		text: 'Hab beide gefragt. Ihre Aussagen passen nicht zusammen.',
		time: '20:58'
	},
	{
		id: 's6',
		from: 'lucy',
		text: 'Wie meinst du das, passen nicht zusammen?',
		time: '21:00',
		contradiction: {
			label: 'WIDERSPRUCH: TATZEIT',
			clueLabel: 'UNGEFÄHRE TATZEIT',
			sources: [
				{ who: 'Max', claim: '„Kurz vor eins, ich stand noch draußen rauchen.“' },
				{ who: 'Sabine', claim: '„Das war halb zwölf. Ich bin danach direkt gegangen.“' }
			]
		}
	}
];

export const LUCY_REPLY_BEATS: ReplyBeatMessage[][] = [
	[
		{
			from: 'lucy',
			text: 'Okay. Sabine hat ein Motiv, mich anzulügen — aber Max hat kein Alibi. Halb zwölf würde bedeuten, dass er noch drin war.'
		}
	],
	[
		{ from: 'lucy', text: 'Ich frag Hans. Der stand die halbe Nacht an der Garderobe.' },
		{ from: 'lucy', text: 'Gib mir zwei Stunden.' }
	],
	[
		{
			from: 'lucy',
			text: 'Hans sagt, Max war um halb zwölf an meiner Jacke. Ich mach eine Gruppe auf. Alle drin.'
		}
	]
];

export const GROUP_SEED: SeedMessage[] = [
	{
		id: 'g0',
		from: 'system',
		text: 'Lucy hat die Gruppe „Samstagnacht“ erstellt · 4 Teilnehmende'
	},
	{
		id: 'g1',
		from: 'lucy',
		text: 'Ich mach das jetzt hier, damit niemand zwei Versionen erzählen kann.',
		time: '23:06'
	},
	{ id: 'g2', from: 'max', text: 'Was soll das denn werden', time: '23:06' },
	{
		id: 'g3',
		from: 'sabine',
		text: 'Ich hab von Anfang an gesagt, dass es halb zwölf war.',
		time: '23:07'
	},
	{
		id: 'g4',
		from: 'max',
		text: 'Ich war zu der Zeit draußen. Frag wen du willst.',
		time: '23:07',
		contradiction: {
			label: 'WIDERSPRUCH: AUFENTHALTSORT',
			clueLabel: "MAX' AUFENTHALTSORT",
			sources: [
				{ who: 'Max (jetzt)', claim: '„Ich war um halb zwölf draußen.“' },
				{ who: 'Hans, Garderobe', claim: '„Max stand um halb zwölf an Lucys Jacke.“' }
			]
		}
	},
	{
		id: 'g5',
		from: 'lucy',
		text: 'Hans sagt was anderes. Du weißt genau, was er sagt.',
		time: '23:08'
	}
];

export const SOLO_CHIPS: ChatChip[] = [
	{ id: 'c1', label: 'Erzähl mir mehr.' },
	{ id: 'c2', label: 'Wem glaubst du?' },
	{ id: 'c3', label: 'Wer war noch da?' }
];

export const GROUP_CHIPS: ChatChip[] = [
	{ id: 'c1', label: 'Hans hat dich um halb zwölf an der Jacke gesehen.' },
	{ id: 'c2', label: 'Beweise vorlegen' },
	{ id: 'c3', label: 'Max, sag die Wahrheit.' }
];

export const INITIAL_MILESTONES: Milestone[] = [
	{
		id: 'm1',
		title: 'Unbekannte Nummer',
		time: '20:12',
		done: true,
		desc: 'Erster Kontakt angenommen, statt zu blocken.'
	},
	{
		id: 'm2',
		title: 'Zwei Quellen',
		time: '20:47',
		done: true,
		desc: 'Max und Sabine unabhängig voneinander befragt.',
		badge: {
			title: 'Doppelt geprüft',
			glyph: 'II',
			desc: 'Jeden Hinweis von zwei Seiten bestätigt.'
		}
	},
	{
		id: 'm3',
		title: 'Widerspruch entdeckt',
		time: '20:58',
		done: true,
		desc: 'Die Aussagen zur Tatzeit passen nicht zusammen — du hast es bemerkt.',
		badge: {
			title: 'Erster Widerspruch',
			glyph: '!',
			desc: 'Zwei Aussagen gegeneinander gestellt.'
		}
	},
	{
		id: 'm4',
		title: "Hans' Hinweis",
		time: '23:04',
		done: true,
		desc: 'Lucys Nachfrage an der Garderobe brachte den entscheidenden Zeugen.'
	},
	{
		id: 'm5',
		title: 'Konfrontation',
		time: '—',
		done: false,
		desc: 'Max im Gruppenchat mit der vollständigen Beweislage stellen.'
	},
	{
		id: 'm6',
		title: 'Fall gelöst',
		time: '—',
		done: false,
		desc: 'Geständnis erreicht, ohne eine falsche Beschuldigung auszusprechen.'
	}
];

export const EARNED_ACHIEVEMENTS: Achievement[] = [
	{ id: 'e1', glyph: '✓', title: 'Fall gelöst' },
	{ id: 'e2', glyph: '◆', title: 'Alle Hinweise gefunden' },
	{ id: 'e3', glyph: '◇', title: 'Ohne Falschbeschuldigung' }
];

export const CASE_SOLVED_MESSAGE =
	'Max hat gestanden. Lucy bekommt ihr Portmonnaie zurück — und du hast niemanden falsch beschuldigt.';
