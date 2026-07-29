/**
 * Runtime session state for the currently-playing story ("Lucys Portmonnaie").
 * Stands in for the real `engine/` story-state-machine (docs/concept.md §3.2) —
 * scripted beats instead of an LLM/state-graph, but the same shape: messages,
 * milestones, and achievements advance as the player interacts.
 *
 * A singleton (like `toast.svelte.ts`) so progress survives navigating between
 * `/chat/lucy`, `/chat/group` and back — closing a screen doesn't reset the case.
 */

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { mentionsEvidence } from '$lib/story/detect-evidence.js';
import {
	CASE_SOLVED_MESSAGE,
	EARNED_ACHIEVEMENTS,
	GROUP_SEED,
	INITIAL_MILESTONES,
	LUCY_REPLY_BEATS,
	LUCY_SEED
} from '$lib/story/lucys-portmonnaie.js';
import type { Achievement, Milestone, SeedMessage } from '$lib/story/types.js';

export type ThreadId = 'lucy' | 'group';

interface AchievementToastState {
	text: string;
	glyph: string;
}

function nowTime(): string {
	const d = new Date();
	return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

let nextMessageId = 1;

class GameStore {
	lucyMessages = $state<SeedMessage[]>(LUCY_SEED.slice());
	groupMessages = $state<SeedMessage[]>(GROUP_SEED.slice());
	lucyTyping = $state(false);
	groupTyping = $state(false);
	lucyOpenFlagId = $state<string | null>(null);
	groupOpenFlagId = $state<string | null>(null);
	milestones = $state<Milestone[]>(INITIAL_MILESTONES.slice());
	solved = $state(false);
	achievementToast = $state<AchievementToastState | null>(null);
	celebrationVisible = $state(false);

	#replyIdx = 0;
	#timers: ReturnType<typeof setTimeout>[] = [];

	get earned(): Achievement[] {
		return EARNED_ACHIEVEMENTS;
	}

	messagesFor(thread: ThreadId): SeedMessage[] {
		return thread === 'group' ? this.groupMessages : this.lucyMessages;
	}

	typingFor(thread: ThreadId): boolean {
		return thread === 'group' ? this.groupTyping : this.lucyTyping;
	}

	openFlagFor(thread: ThreadId): string | null {
		return thread === 'group' ? this.groupOpenFlagId : this.lucyOpenFlagId;
	}

	toggleFlag(thread: ThreadId, messageId: string): void {
		if (thread === 'group') {
			this.groupOpenFlagId = this.groupOpenFlagId === messageId ? null : messageId;
		} else {
			this.lucyOpenFlagId = this.lucyOpenFlagId === messageId ? null : messageId;
		}
	}

	#later(fn: () => void, ms: number): void {
		if (!browser) return;
		this.#timers.push(setTimeout(fn, ms));
	}

	#push(thread: ThreadId, message: Omit<SeedMessage, 'id'>): void {
		const withId = { ...message, id: `${thread}-${nextMessageId++}` };
		if (thread === 'group') this.groupMessages = [...this.groupMessages, withId];
		else this.lucyMessages = [...this.lucyMessages, withId];
	}

	#showAchievementToast(text: string, glyph: string): void {
		this.achievementToast = { text, glyph };
		this.#later(() => {
			this.achievementToast = null;
		}, 4200);
	}

	send(thread: ThreadId, text: string): void {
		const trimmed = text.trim();
		if (!trimmed) return;
		this.#push(thread, { from: 'me', text: trimmed, time: nowTime() });
		if (thread === 'group') this.#groupBeat(trimmed);
		else this.#lucyBeat();
	}

	#lucyBeat(): void {
		const beatIndex = this.#replyIdx;
		const beat = LUCY_REPLY_BEATS[Math.min(beatIndex, LUCY_REPLY_BEATS.length - 1)];
		this.#replyIdx += 1;

		this.#later(() => {
			this.lucyTyping = true;
		}, 500);
		beat.forEach((message, n) => {
			this.#later(
				() => {
					this.lucyTyping = n < beat.length - 1;
					this.#push('lucy', { from: message.from, text: message.text, time: nowTime() });
				},
				1500 + n * 1400
			);
		});

		if (beatIndex === 0) {
			this.#later(() => this.#showAchievementToast('Erster Widerspruch', '!'), 3600);
		}
		if (beatIndex >= 2) {
			this.#later(
				() => {
					if (browser) void goto(resolve('/chat/[thread]', { thread: 'group' }));
				},
				1500 + beat.length * 1400 + 900
			);
		}
	}

	#groupBeat(text: string): void {
		this.#later(() => {
			this.groupTyping = true;
		}, 400);

		if (mentionsEvidence(text)) {
			this.#later(() => {
				this.groupTyping = true;
				this.#push('group', { from: 'max', text: '…', time: nowTime() });
			}, 1400);
			this.#later(() => {
				this.groupTyping = false;
				this.#push('group', {
					from: 'max',
					text: ' Okay. Ich war es. Ich wollte es zurückgeben, ich hab nur nicht gewusst wie.',
					time: nowTime()
				});
			}, 2900);
			this.#later(
				() =>
					this.#push('group', {
						from: 'lucy',
						text: 'Morgen, 18 Uhr, Café am Markt. Bring alles mit.',
						time: nowTime()
					}),
				4200
			);
			this.#later(() => this.#solveCase(), 5400);
		} else {
			this.#later(() => {
				this.groupTyping = false;
				this.#push('group', {
					from: 'sabine',
					text: 'Sag doch einfach, was Hans gesehen hat.',
					time: nowTime()
				});
			}, 1700);
		}
	}

	#solveCase(): void {
		this.solved = true;
		this.celebrationVisible = true;
		this.milestones = this.milestones.map((m) => {
			if (m.id === 'm5') return { ...m, done: true, time: '23:11' };
			if (m.id === 'm6') {
				return {
					...m,
					done: true,
					time: '23:14',
					badge: {
						title: 'Ohne Falschbeschuldigung',
						glyph: '◇',
						desc: 'Gelöst, ohne eine unschuldige Person zu beschuldigen.'
					}
				};
			}
			return m;
		});
	}

	closeCelebration(): void {
		this.celebrationVisible = false;
	}
}

export const game = new GameStore();
export const caseSolvedMessage = CASE_SOLVED_MESSAGE;
