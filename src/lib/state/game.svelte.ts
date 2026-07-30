/**
 * Runtime session state for the currently-playing story ("Lucys Portmonnaie"). Used to be
 * scripted timers standing in for the real engine (docs/concept.md §3.2) — now a thin
 * adapter over `$lib/state/engine.svelte.ts` (the real `StoryEngine` + save persistence)
 * and `$lib/llm` (real streamed replies once the authored script runs out). The authored
 * German dialogue itself is unchanged and still lives in `$lib/story/lucys-portmonnaie.ts`;
 * this module only decides *when* it plays and what state change it causes.
 *
 * A singleton (like `toast.svelte.ts`) so progress survives navigating between
 * `/chat/lucy`, `/chat/group` and back — closing a screen doesn't reset the case.
 */

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { llm } from '$lib/llm/llm.svelte.js';
import { saveStore, type SaveChatMessage } from '$lib/storage/index.js';
import { mentionsEvidence } from '$lib/story/detect-evidence.js';
import {
	CASE_SOLVED_MESSAGE,
	GROUP_SEED,
	LUCY_REPLY_BEATS,
	LUCY_SEED
} from '$lib/story/lucys-portmonnaie.js';
import {
	CLUE_MAX_WHEREABOUTS,
	CLUE_TIME_WINDOW,
	FLAG_EVIDENCE_PRESENTED,
	FLAG_LUCY_BRIEFED,
	LUCY_ID,
	MAX_ID,
	OUTCOME_MAX_CONFESSES,
	SABINE_ID,
	SCENE_GROUP,
	SCENE_LUCY
} from '$lib/story/reference-package.js';
import type { Achievement, Milestone, SeedMessage, SpeakerId } from '$lib/story/types.js';
import { storyRuntime } from './engine.svelte.js';

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

const LUCY_SYSTEM_PROMPT =
	'Du bist Lucy, eine Studentin aus Riddlon, deren Portmonnaie letzten Samstag im Club gestohlen ' +
	'wurde. Du befragst gerade eine befreundete Person zu dem Fall. Antworte kurz (1-2 Sätze), in ' +
	'der Ich-Form, auf Deutsch, im Ton einer besorgten aber dankbaren Freundin.';

class GameStore {
	lucyMessages = $state<SeedMessage[]>([]);
	groupMessages = $state<SeedMessage[]>([]);
	lucyTyping = $state(false);
	groupTyping = $state(false);
	lucyOpenFlagId = $state<string | null>(null);
	groupOpenFlagId = $state<string | null>(null);
	achievementToast = $state<AchievementToastState | null>(null);
	celebrationVisible = $state(false);

	#lucyBeatsPlayed = 0;
	#groupSeeded = false;
	#timers: ReturnType<typeof setTimeout>[] = [];
	#initPromise: Promise<void> | null = null;

	get milestones(): Milestone[] {
		return storyRuntime.milestones;
	}

	get earned(): Achievement[] {
		return storyRuntime.earnedAchievements;
	}

	get solved(): boolean {
		return storyRuntime.solved;
	}

	constructor() {
		if (browser) void this.init();
	}

	/** Idempotent — safe to call from every screen that reads chat state. */
	init(): Promise<void> {
		if (!this.#initPromise) this.#initPromise = this.#doInit();
		return this.#initPromise;
	}

	async #doInit(): Promise<void> {
		await storyRuntime.init();
		if (!storyRuntime.saveId) return;

		const existing = await saveStore.get(storyRuntime.saveId);
		if (!existing) return;

		if (existing.chatHistory.length === 0) {
			await this.#seedLucyThread();
		} else {
			this.#hydrateFromHistory(existing.chatHistory);
		}
	}

	/** First-ever open: install Lucy's pre-written history (#30's "seed chat" concept) and
	 *  record the contradiction it already reveals — the milestones/achievements it drives
	 *  should reflect content the player can already read, not a decoupled static flag. */
	async #seedLucyThread(): Promise<void> {
		this.lucyMessages = LUCY_SEED.slice();
		if (storyRuntime.saveId) {
			for (const message of LUCY_SEED) {
				await saveStore.appendChatMessage(storyRuntime.saveId, toSaveMessage(message, SCENE_LUCY));
			}
		}
		storyRuntime.recordClueClaim(CLUE_TIME_WINDOW, MAX_ID, 'kurz vor eins');
		storyRuntime.recordClueClaim(CLUE_TIME_WINDOW, SABINE_ID, 'halb zwölf');
	}

	async #seedGroupThread(): Promise<void> {
		if (this.#groupSeeded) return;
		this.#groupSeeded = true;
		this.groupMessages = GROUP_SEED.slice();
		if (storyRuntime.saveId) {
			for (const message of GROUP_SEED) {
				await saveStore.appendChatMessage(storyRuntime.saveId, toSaveMessage(message, SCENE_GROUP));
			}
		}
		// Max's own (conflicting) account of his whereabouts — the group seed's dramatic beat,
		// now a real clue claim instead of a hardcoded `contradiction` block with no state behind it.
		storyRuntime.recordClueClaim(CLUE_MAX_WHEREABOUTS, MAX_ID, 'draußen');
	}

	/** Reconstructs both threads' display arrays from a resumed save. `#lucyBeatsPlayed` is
	 *  re-derived from how many player messages exist beyond the seed — exact because
	 *  `send()` increments it exactly once per player message in the Lucy thread. */
	#hydrateFromHistory(history: SaveChatMessage[]): void {
		const attach = (message: SaveChatMessage): SeedMessage => {
			const seedMatch =
				LUCY_SEED.find((m) => m.id === message.id) ?? GROUP_SEED.find((m) => m.id === message.id);
			return {
				id: message.id,
				from: message.from as SpeakerId,
				text: message.text,
				time: seedMatch?.time ?? new Date(message.sentAt).toTimeString().slice(0, 5),
				contradiction: seedMatch?.contradiction
			};
		};

		this.lucyMessages = history.filter((m) => m.sceneId === SCENE_LUCY).map(attach);
		this.groupMessages = history.filter((m) => m.sceneId === SCENE_GROUP).map(attach);
		this.#groupSeeded = this.groupMessages.length > 0;

		const meInSeed = LUCY_SEED.filter((m) => m.from === 'me').length;
		const meTotal = this.lucyMessages.filter((m) => m.from === 'me').length;
		this.#lucyBeatsPlayed = Math.min(LUCY_REPLY_BEATS.length, Math.max(0, meTotal - meInSeed));
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

	#pushAndPersist(
		thread: ThreadId,
		sceneId: string,
		message: Omit<SeedMessage, 'id' | 'time'>
	): void {
		const withId: SeedMessage = { ...message, id: `${thread}-${nextMessageId++}`, time: nowTime() };
		if (thread === 'group') this.groupMessages = [...this.groupMessages, withId];
		else this.lucyMessages = [...this.lucyMessages, withId];
		if (storyRuntime.saveId) {
			void saveStore.appendChatMessage(storyRuntime.saveId, toSaveMessage(withId, sceneId));
		}
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
		this.#pushAndPersist(thread, thread === 'group' ? SCENE_GROUP : SCENE_LUCY, {
			from: 'me',
			text: trimmed
		});
		if (thread === 'group') this.#groupBeat(trimmed);
		else this.#lucyBeat(trimmed);
	}

	#lucyBeat(text: string): void {
		const beatIndex = this.#lucyBeatsPlayed;
		if (beatIndex < LUCY_REPLY_BEATS.length) {
			this.#lucyBeatsPlayed += 1;
			this.#playScriptedLucyBeat(beatIndex);
		} else {
			void this.#streamLucyReply(text);
		}
	}

	#playScriptedLucyBeat(beatIndex: number): void {
		const beat = LUCY_REPLY_BEATS[beatIndex];
		const isFinalBeat = beatIndex === LUCY_REPLY_BEATS.length - 1;

		this.#later(() => {
			this.lucyTyping = true;
		}, 500);
		beat.forEach((message, n) => {
			this.#later(
				() => {
					this.lucyTyping = n < beat.length - 1;
					this.#pushAndPersist('lucy', SCENE_LUCY, { from: message.from, text: message.text });
				},
				1500 + n * 1400
			);
		});

		if (beatIndex === 0) {
			this.#later(() => {
				const badge = storyRuntime.milestones.find((m) => m.id === 'm3')?.badge;
				if (badge) this.#showAchievementToast(badge.title, badge.glyph);
			}, 3600);
		}
		if (isFinalBeat) {
			this.#later(() => this.#briefLucyDone(), 1500 + beat.length * 1400 + 900);
		}
	}

	/** Hans' account becomes known and the story-graph exit condition fires for real — the
	 *  group scene unlocking (rather than a raw "3rd reply" counter) is what triggers the move. */
	#briefLucyDone(): void {
		storyRuntime.recordClueClaim(CLUE_MAX_WHEREABOUTS, LUCY_ID, 'an der Jacke, laut Hans');
		const effects = storyRuntime.setFlag(FLAG_LUCY_BRIEFED);
		const groupUnlocked = effects.some(
			(effect) => effect.type === 'scene-unlocked' && effect.sceneId === SCENE_GROUP
		);
		if (!groupUnlocked) return;
		void this.#seedGroupThread().then(() => {
			if (browser) void goto(resolve('/chat/[thread]', { thread: 'group' }));
		});
	}

	/** The engine has no more scripted beats for this thread — a real LLM reply, streamed in,
	 *  replaces the old "clamp to the last beat forever" fallback. */
	async #streamLucyReply(promptText: string): Promise<void> {
		this.lucyTyping = true;
		const id = `lucy-${nextMessageId++}`;
		try {
			const session = await llm.session('lucy', { systemPrompt: LUCY_SYSTEM_PROMPT });
			let text = '';
			let started = false;
			for await (const delta of session.stream(promptText)) {
				text += delta;
				if (!started) {
					started = true;
					this.lucyTyping = false;
					this.lucyMessages = [...this.lucyMessages, { id, from: 'lucy', text, time: nowTime() }];
				} else {
					this.lucyMessages = this.lucyMessages.map((m) => (m.id === id ? { ...m, text } : m));
				}
			}
			if (storyRuntime.saveId && text) {
				await saveStore.appendChatMessage(
					storyRuntime.saveId,
					toSaveMessage({ id, from: 'lucy', text, time: nowTime() }, SCENE_LUCY)
				);
			}
		} catch {
			// Degrades to no reply rather than crashing the thread — see `boot.continueWithoutLlm`.
		} finally {
			this.lucyTyping = false;
		}
	}

	#groupBeat(text: string): void {
		this.#later(() => {
			this.groupTyping = true;
		}, 400);

		if (mentionsEvidence(text)) {
			this.#later(() => {
				this.groupTyping = true;
				this.#pushAndPersist('group', SCENE_GROUP, { from: 'max', text: '…' });
			}, 1400);
			this.#later(() => {
				this.groupTyping = false;
				this.#pushAndPersist('group', SCENE_GROUP, {
					from: 'max',
					text: 'Okay. Ich war es. Ich wollte es zurückgeben, ich hab nur nicht gewusst wie.'
				});
			}, 2900);
			this.#later(
				() =>
					this.#pushAndPersist('group', SCENE_GROUP, {
						from: 'lucy',
						text: 'Morgen, 18 Uhr, Café am Markt. Bring alles mit.'
					}),
				4200
			);
			this.#later(() => this.#solveCase(), 5400);
		} else {
			this.#later(() => {
				this.groupTyping = false;
				this.#pushAndPersist('group', SCENE_GROUP, {
					from: 'sabine',
					text: 'Sag doch einfach, was Hans gesehen hat.'
				});
			}, 1700);
		}
	}

	#solveCase(): void {
		const effects = storyRuntime.setFlag(FLAG_EVIDENCE_PRESENTED);
		const caseSolved = effects.some(
			(effect) => effect.type === 'outcome-reached' && effect.outcomeId === OUTCOME_MAX_CONFESSES
		);
		if (caseSolved) this.celebrationVisible = true;
	}

	closeCelebration(): void {
		this.celebrationVisible = false;
	}
}

function toSaveMessage(message: SeedMessage, sceneId: string): SaveChatMessage {
	return {
		id: message.id,
		sceneId,
		from: message.from,
		text: message.text,
		sentAt: new Date().toISOString()
	};
}

export const game = new GameStore();
export const caseSolvedMessage = CASE_SOLVED_MESSAGE;
