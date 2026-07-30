/** Shared shapes for mock story-package content (see docs/concept.md §5 for the real package format). */

export type SpeakerId = 'system' | 'me' | 'lucy' | 'max' | 'sabine';

export interface StoryCharacter {
	id: Exclude<SpeakerId, 'system' | 'me'>;
	name: string;
	initial: string;
}

/**
 * References which clue a message's "WIDERSPRUCH: ..." panel is about — `label` is authored
 * dialogue framing (the heading text), everything else (the clue's own label, the claimed
 * sources) is resolved live from `EngineState.clues[clueId]` via `storyRuntime.clueDisplays`,
 * never hardcoded here. See #35.
 */
export interface Contradiction {
	label: string;
	clueId: string;
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
