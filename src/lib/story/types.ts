/** Shared shapes for mock story-package content (see docs/concept.md §5 for the real package format). */

export type SpeakerId = 'system' | 'me' | 'lucy' | 'max' | 'sabine';

export interface StoryCharacter {
	id: Exclude<SpeakerId, 'system' | 'me'>;
	name: string;
	initial: string;
}

export interface ClueSource {
	who: string;
	claim: string;
}

export interface Contradiction {
	label: string;
	clueLabel: string;
	sources: ClueSource[];
}

export interface SeedMessage {
	id: string;
	from: SpeakerId;
	text: string;
	time?: string;
	contradiction?: Contradiction;
}

export interface ReplyBeatMessage {
	from: SpeakerId;
	text: string;
}

export interface MilestoneBadge {
	title: string;
	glyph: string;
	desc: string;
}

export interface Milestone {
	id: string;
	title: string;
	time: string;
	done: boolean;
	desc: string;
	badge?: MilestoneBadge;
}

export interface Achievement {
	id: string;
	glyph: string;
	title: string;
}

export interface ChatChip {
	id: string;
	label: string;
}
