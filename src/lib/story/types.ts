/** Shared UI-facing shapes for whatever story package is installed (docs/concept.md §5). */

/**
 * Who a chat message is from: two reserved values plus character UUIDs from the active
 * package's cast. There is no fixed set of speakers any more, because the app no longer ships
 * story content of its own.
 */
export const SPEAKER_ME = 'me';
export const SPEAKER_SYSTEM = 'system';
export type SpeakerId = string;

export function isCharacterSpeaker(from: SpeakerId): boolean {
	return from !== SPEAKER_ME && from !== SPEAKER_SYSTEM;
}

export interface ChatMessage {
	id: string;
	from: SpeakerId;
	text: string;
	/** `HH:MM`, display only. */
	time?: string;
	/** ISO — what ordering and "newer than" comparisons use; `time` is lossy. */
	sentAt?: string;
	/**
	 * Set when this message is what taught the engine a clue claim. The "WIDERSPRUCH: …" panel
	 * resolves its contents live from `EngineState.clues[clueId]`, so the message only ever
	 * carries the reference, never the claims (#35).
	 */
	clueId?: string;
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
