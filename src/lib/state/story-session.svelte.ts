/**
 * The live chat session for whatever story package is active: threads, messages, typing state,
 * and the loop that turns a player message into a character reply and story progress.
 *
 * This replaces `game.svelte.ts`, which was a scripted timer sequence over hardcoded German
 * dialogue for one built-in demo story. Nothing here knows a character, a scene or a package —
 * personas, goals, facts and secrets all come from the installed package via `storyRuntime`,
 * replies come from `#lib/llm`, and progress comes from the director pass (`llm/director.ts`)
 * feeding the engine.
 *
 * A singleton (like `toast.svelte.ts`) so a conversation survives navigating between screens.
 */

import { browser } from '$app/env';
import { llm } from '#lib/llm/llm.svelte.js';
import {
	buildDirectorPrompt,
	buildDirectorQuestions,
	buildDirectorSchema,
	exitFlagsReached,
	hasDirectorQuestions,
	parseDirectorVerdict,
	type DirectorVerdict
} from '#lib/llm/director.js';
import { isLlmError } from '#lib/llm/errors.js';
import { buildOpeningInstruction, pickResponder } from '#lib/llm/persona.js';
import { buildScenePersonaPrompt } from '#lib/story/persona-input.js';
import { countUnread } from '#lib/story/unread.js';
import { formatMessageTimestamp } from '#lib/story/message-time.js';
import { t } from '#lib/i18n/i18n.svelte.js';
import { saveStore, type SaveChatMessage } from '#lib/storage/index.js';
import {
	isCharacterSpeaker,
	SPEAKER_ME,
	type ChatMessage,
	type SpeakerId
} from '#lib/story/types.js';
import type { StoryThread } from '#lib/story/story-display.js';
import { storyRuntime } from './engine.svelte.js';
import { profile } from './profile.svelte.js';

/** How much conversation the director sees. Enough for a claim to be in view, short enough that
 *  a 3B model still answers with JSON. */
const DIRECTOR_WINDOW = 6;

function toChatMessage(message: SaveChatMessage): ChatMessage {
	return {
		id: message.id,
		from: message.from,
		text: message.text,
		// Date-aware, because a thread can carry authored history days older than this session
		// (#30) — see `story/message-time.ts`.
		time: formatMessageTimestamp(message.sentAt, { yesterdayLabel: t('convo.yesterday') }),
		sentAt: message.sentAt,
		clueId: message.clueId
	};
}

class StorySession {
	/** `init()` has finished, successfully or not — lets screens tell "still loading the resumed
	 *  thread" apart from "genuinely empty" instead of flashing an empty conversation. */
	initialized = $state(false);
	/** A newly activated package's history is still loading. */
	syncing = $state(false);
	history = $state<SaveChatMessage[]>([]);
	/** Thread key → ISO time it was last open (#51). */
	threadReads = $state<Record<string, string>>({});
	/** Scenes currently waiting on the model. */
	typingSceneIds = $state<string[]>([]);
	openClueMessageId = $state<string | null>(null);
	celebrationVisible = $state(false);
	/** Set when a reply couldn't be produced (no model, load failure, aborted stream), so the
	 *  thread says so instead of going quiet. */
	errorCode = $state<string | null>(null);
	/** The director's last raw answer and what survived the allowlist — read by `/dev/story`,
	 *  because a wrong verdict is otherwise invisible. */
	lastDirectorRaw = $state<string | null>(null);
	lastDirectorVerdict = $state<DirectorVerdict | null>(null);
	/** Scene id → goals the director has judged reached so far (#54), persisted in the save. */
	reachedGoals = $state<Record<string, string[]>>({});

	#initPromise: Promise<void> | null = null;
	#loadedSaveId: string | null = null;
	#loadQueue: Promise<void> = Promise.resolve();
	#openedScenes = new Set<string>();
	#busyScenes = new Set<string>();

	constructor() {
		if (browser) {
			// Activation can happen long after init (an import into an empty library, or a
			// `switchTo` from the library screen). The old game store memoised its "no save yet"
			// early return forever and therefore never caught up — that was half of the
			// "chats are empty after a reload" bug.
			storyRuntime.onActivate(() => void this.#syncWithActiveSave());
			void this.init();
		}
	}

	/** Idempotent — safe to call from every screen that reads chat state. */
	init(): Promise<void> {
		if (!this.#initPromise) {
			this.#initPromise = this.#doInit().finally(() => {
				this.initialized = true;
			});
		}
		return this.#initPromise;
	}

	get threads(): StoryThread[] {
		return storyRuntime.threads;
	}

	messagesFor(threadKey: string): ChatMessage[] {
		const thread = storyRuntime.threadFor(threadKey);
		if (!thread) return [];
		const scenes = new Set(thread.sceneIds);
		return this.history.filter((m) => scenes.has(m.sceneId)).map(toChatMessage);
	}

	lastMessageFor(threadKey: string): ChatMessage | undefined {
		return this.messagesFor(threadKey).at(-1);
	}

	/** Messages from someone else since the thread was last open. Authored seed history is
	 *  installed content, never news, so it does not count (#51). */
	unreadFor(threadKey: string): number {
		const thread = storyRuntime.threadFor(threadKey);
		if (!thread) return 0;
		const scenes = new Set(thread.sceneIds);
		const messages = this.history
			.filter((m) => !m.seed && scenes.has(m.sceneId))
			.map(toChatMessage);
		return countUnread(messages, this.threadReads[threadKey]);
	}

	/** Call while the thread is open; persists the marker only when it actually moves anything. */
	markRead(threadKey: string): void {
		const saveId = storyRuntime.saveId;
		if (!saveId || !storyRuntime.threadFor(threadKey)) return;
		if (this.threadReads[threadKey] && this.unreadFor(threadKey) === 0) return;
		const at = new Date().toISOString();
		this.threadReads = { ...this.threadReads, [threadKey]: at };
		void saveStore.markThreadRead(saveId, threadKey, at);
	}

	typingFor(threadKey: string): boolean {
		const thread = storyRuntime.threadFor(threadKey);
		if (!thread) return false;
		return thread.sceneIds.some((id) => this.typingSceneIds.includes(id));
	}

	toggleClue(messageId: string): void {
		this.openClueMessageId = this.openClueMessageId === messageId ? null : messageId;
	}

	closeCelebration(): void {
		this.celebrationVisible = false;
	}

	async #doInit(): Promise<void> {
		await storyRuntime.init();
		await this.#syncWithActiveSave();
	}

	/**
	 * Loads the active package's chat history. Idempotent per save id and serialised through
	 * `#loadQueue`, so two activations in quick succession can never interleave into one thread.
	 */
	#syncWithActiveSave(): Promise<void> {
		const saveId = storyRuntime.saveId;
		if (saveId !== null && saveId !== this.#loadedSaveId) {
			this.syncing = true;
			this.#loadQueue = this.#loadQueue
				.then(() => this.#loadSave(saveId))
				.finally(() => {
					this.syncing = false;
				});
		}
		return this.#loadQueue;
	}

	async #loadSave(saveId: string): Promise<void> {
		if (saveId === this.#loadedSaveId) return;
		const existing = await saveStore.get(saveId);
		if (!existing) return;
		// Claimed before anything else awaits, so a second call can't load the same save twice.
		this.#loadedSaveId = saveId;
		this.history = existing.chatHistory;
		this.threadReads = { ...existing.threadReads };
		this.reachedGoals = { ...existing.reachedGoals };
		// A save from before read markers existed: everything already there counts as read, so an
		// old save can't open with an inflated badge (#51).
		if (existing.threadReads === undefined) {
			const at = new Date().toISOString();
			for (const thread of storyRuntime.threads) {
				this.threadReads[thread.key] = at;
				void saveStore.markThreadRead(saveId, thread.key, at);
			}
		}
		// Seed messages are authored history, not a scene the player has already been greeted in —
		// counting them would make `openThread` skip the character's actual first message (#30).
		this.#openedScenes = new Set(existing.chatHistory.filter((m) => !m.seed).map((m) => m.sceneId));
		this.#busyScenes.clear();
		this.typingSceneIds = [];
		this.errorCode = null;
	}

	/**
	 * Writes a scene's first message if it has none yet. A package ships no authored dialogue,
	 * so without this a newly unlocked contact would sit in an empty thread forever — the
	 * "why doesn't anyone write to me" half of the reported bug.
	 */
	async openThread(threadKey: string): Promise<void> {
		await this.init();
		const thread = storyRuntime.threadFor(threadKey);
		const sceneId = thread?.activeSceneId;
		if (!thread || !sceneId) return;
		if (this.#openedScenes.has(sceneId) || this.#busyScenes.has(sceneId)) return;
		// Cold scenes wait for the player to write first — the character's `goals` still drive
		// what they say once addressed, via the normal `send()` path.
		if (this.#sceneNode(sceneId)?.autoOpen === false) return;
		// Never triggers a model download from a thread open — `llm.session()` would call
		// `ensureLoaded()`, and a multi-GB fetch is the boot screen's decision, not a side effect
		// of tapping a chat.
		if (!llm.ready) {
			this.errorCode = 'no-model';
			return;
		}

		const speakerId = thread.participantIds[0];
		if (!speakerId) return;

		this.#busyScenes.add(sceneId);
		this.#setTyping(sceneId, true);
		try {
			const session = await llm.session(`${threadKey}:${speakerId}`, {
				systemPrompt: this.#personaPromptFor(speakerId, sceneId, thread)
			});
			const goals = storyRuntime.sceneById(sceneId)?.goals ?? [];
			const text = (await session.prompt(buildOpeningInstruction(profile.nickname, goals))).trim();
			if (!text) return;
			this.#openedScenes.add(sceneId);
			await this.#persist(sceneId, speakerId, text);
		} catch {
			this.errorCode = 'opening-failed';
		} finally {
			this.#setTyping(sceneId, false);
			this.#busyScenes.delete(sceneId);
		}
	}

	/**
	 * The player sends a message: persist it, get a reply, then let the director move the story.
	 *
	 * `thread.activeSceneId` is `null` once every unlocked scene for this thread is already `done`
	 * and nothing further has unlocked (a `group-chat-scene` never chains a `next`, so this is a
	 * normal, permanent state, not a transient one). Falling back to the thread's last known scene
	 * id — rather than refusing to send — is what lets the player keep chatting with a character
	 * independent of where the graph currently stands; `#personaPromptFor`'s `idle` flag then swaps
	 * that scene's goals for "already resolved" framing instead of dropping them.
	 */
	async send(threadKey: string, text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) return;
		const thread = storyRuntime.threadFor(threadKey);
		if (!thread) return;
		const activeSceneId = thread.activeSceneId;
		const sceneId = activeSceneId ?? thread.sceneIds.at(-1) ?? null;
		if (!sceneId) return;

		// The player's own message is theirs either way — it is kept even when no reply can be
		// produced, so nothing they typed silently disappears.
		await this.#persist(sceneId, SPEAKER_ME, trimmed);
		if (this.#busyScenes.has(sceneId)) return;
		if (!llm.ready) {
			this.errorCode = 'no-model';
			return;
		}

		const cast = storyRuntime.cast.filter((c) => thread.participantIds.includes(c.id));
		const speakerId = pickResponder(cast, trimmed);
		if (!speakerId) return;

		const idle = activeSceneId == null;
		this.#busyScenes.add(sceneId);
		this.#setTyping(sceneId, true);
		this.errorCode = null;
		let reply: string;
		try {
			const session = await llm.session(`${threadKey}:${speakerId}`, {
				systemPrompt: this.#personaPromptFor(speakerId, sceneId, thread, { idle })
			});
			reply = await session.prompt(trimmed);
		} catch (error) {
			// A stream that broke mid-generation still leaves whatever was produced before the
			// break (`LlmError.partial`) — persisted below rather than dropped, same as before.
			reply = (isLlmError(error) && error.partial) || '';
			this.errorCode = 'reply-failed';
		} finally {
			this.#setTyping(sceneId, false);
			this.#busyScenes.delete(sceneId);
		}

		const answer = reply.trim();
		if (!answer) return;
		const message = await this.#persist(sceneId, speakerId, answer);
		// No scene left to advance once idle — its exit conditions are already satisfied.
		if (!idle) await this.#runDirector(sceneId, thread, message);
	}

	/**
	 * Asks the model the scene's open questions — clue claims, each goal, each mid-scene event, the
	 * ending of a group scene — then applies the verdict through the engine. This is what advances
	 * the graph: a package declares `exitConditions: ["flag:…"]` but ships nothing that could ever
	 * set them. The exit flag itself is never the model's call: it is set here once every goal of the
	 * scene has been judged reached, in this turn or an earlier one (docs/arc42 §8.4.4).
	 */
	async #runDirector(
		sceneId: string,
		thread: StoryThread,
		lastMessage: SaveChatMessage | undefined
	): Promise<void> {
		const node = this.#sceneNode(sceneId);
		const bundle = storyRuntime.bundle;
		if (!node || !bundle) return;

		const cast = storyRuntime.cast.filter((c) => thread.participantIds.includes(c.id));
		const isFlagSet = (ref: string) => storyRuntime.isConditionMet(ref);

		// Only what's still worth asking: a flag already true, a goal already reached, or a clue
		// every cast member has already claimed gains nothing from asking again — and re-asking is
		// how a clue claimed once ends up claimed a second time with a different value.
		const questions = buildDirectorQuestions(
			{ ...node, outcomes: node.type === 'group-chat-scene' ? node.outcomes : [] },
			{
				reachedGoals: new Set(this.reachedGoals[sceneId] ?? []),
				isFlagSet,
				isClueOpen: (clueId) => {
					const claimedBy = new Set(
						(storyRuntime.clueDisplays[clueId]?.sources ?? []).map((s) => s.characterId)
					);
					return cast.some((c) => !claimedBy.has(c.id));
				}
			}
		);
		if (!hasDirectorQuestions(questions)) return;

		const scenes = new Set(thread.sceneIds);
		const sceneMessages = this.history.filter((m) => scenes.has(m.sceneId));
		const toTurn = (m: SaveChatMessage) => ({
			who: m.from === SPEAKER_ME ? profile.nickname : storyRuntime.displayNameFor(m.from),
			text: m.text
		});
		const turns = sceneMessages.slice(-DIRECTOR_WINDOW).map(toTurn);
		// The player's last line and the replies after it — what events are judged on.
		const lastPlayer = sceneMessages.findLastIndex((m) => m.from === SPEAKER_ME);
		const lastExchange = sceneMessages.slice(Math.max(lastPlayer, 0)).map(toTurn);
		// The same names the transcript uses — a masked character is "Unbekannt" in both, or a claim
		// could never be traced back to their lines.
		const characters = cast.map((c) => ({ id: c.id, name: storyRuntime.displayNameFor(c.id) }));
		const clues = bundle.clues.map((clue) => ({ id: clue.id, label: clue.label }));

		let raw: string;
		try {
			// A fresh, historyless session each time: the director must judge this exchange, not
			// accumulate its own past verdicts. Every session gets its own real backend handle
			// (see adapter.ts), so this costs a decode pass but no model reload.
			const session = await llm.session('director', {
				systemPrompt: 'Du antwortest ausschließlich mit JSON.',
				// Chrome's built-in model ignores this on web pages, so its verdict varies between runs
				// (measured in #54) — one reason the questions are kept small. Other providers: unmeasured.
				temperature: 0,
				maxHistoryTurns: 0
			});
			raw = await session.prompt(
				buildDirectorPrompt({ questions, clues, characters, turns, lastExchange }),
				{
					responseSchema: buildDirectorSchema({ questions, characters })
				}
			);
			await session.destroy();
		} catch {
			// No verdict is a valid outcome: the story simply doesn't advance this turn.
			return;
		}

		const verdict = parseDirectorVerdict(raw, { questions, characters, clues, turns });
		this.lastDirectorRaw = raw;
		this.lastDirectorVerdict = verdict;
		await this.#applyVerdict(sceneId, verdict, lastMessage);
	}

	/** `/dev/story`'s "Apply verdict": exactly what a live turn would apply, minus the clue pin. */
	applyDirectorVerdict(sceneId: string, verdict: DirectorVerdict): Promise<void> {
		return this.#applyVerdict(sceneId, verdict, undefined);
	}

	async #applyVerdict(
		sceneId: string,
		verdict: DirectorVerdict,
		lastMessage: SaveChatMessage | undefined
	): Promise<void> {
		const reached = await this.#rememberGoals(sceneId, verdict.goals);
		const node = this.#sceneNode(sceneId);
		const exitFlags = node
			? exitFlagsReached(node, reached, (ref) => storyRuntime.isConditionMet(ref))
			: [];

		let solved = false;
		for (const claim of verdict.clues) {
			const effects = storyRuntime.recordClueClaim(claim.id, claim.characterId, claim.value);
			if (effects.length > 0 && lastMessage && !lastMessage.clueId) {
				// Pin the panel to the message that actually revealed it, so it survives a reload.
				void this.#attachClue(lastMessage.id, claim.id);
			}
			solved ||= effects.some((effect) => effect.type === 'outcome-reached');
		}
		for (const flag of [...verdict.flags, ...exitFlags]) {
			const effects = storyRuntime.setFlag(flag);
			solved ||= effects.some((effect) => effect.type === 'outcome-reached');
		}
		if (solved) {
			// An outcome ends the story; a settled case leaves no contradiction open.
			for (const [clueId, display] of Object.entries(storyRuntime.clueDisplays)) {
				if (display.conflicting && !display.resolved) storyRuntime.resolveClue(clueId);
			}
			this.celebrationVisible = true;
		}
	}

	async #attachClue(messageId: string, clueId: string): Promise<void> {
		const saveId = storyRuntime.saveId;
		if (!saveId) return;
		const chatHistory = this.history.map((m) => (m.id === messageId ? { ...m, clueId } : m));
		this.history = chatHistory;
		await saveStore.update(saveId, { chatHistory });
	}

	/** Thin over `buildScenePersonaPrompt`, which is pure and spec'd — see `story/persona-input.ts`. */
	#personaPromptFor(
		characterId: string,
		sceneId: string,
		thread: StoryThread,
		opts: { idle?: boolean } = {}
	): string {
		const bundle = storyRuntime.bundle;
		if (!bundle) return '';
		return buildScenePersonaPrompt(
			{
				bundle,
				cast: storyRuntime.cast,
				isConditionMet: (ref) => storyRuntime.isConditionMet(ref),
				storyTitle: storyRuntime.title ?? '',
				playerName: profile.nickname
			},
			characterId,
			sceneId,
			thread,
			opts
		);
	}

	#sceneNode(sceneId: string) {
		return storyRuntime.bundle?.graph.nodes.find((node) => node.id === sceneId);
	}

	/** Adds this verdict's goals to the scene's remembered ones and returns the full set (#54). */
	async #rememberGoals(sceneId: string, goals: readonly string[]): Promise<Set<string>> {
		const known = this.reachedGoals[sceneId] ?? [];
		const reached = new Set([...known, ...goals]);
		if (reached.size === known.length) return reached;
		this.reachedGoals = { ...this.reachedGoals, [sceneId]: [...reached] };
		const saveId = storyRuntime.saveId;
		if (saveId) await saveStore.markGoalsReached(saveId, sceneId, goals);
		return reached;
	}

	#setTyping(sceneId: string, typing: boolean): void {
		const others = this.typingSceneIds.filter((id) => id !== sceneId);
		this.typingSceneIds = typing ? [...others, sceneId] : others;
	}

	async #persist(
		sceneId: string,
		from: SpeakerId,
		text: string
	): Promise<SaveChatMessage | undefined> {
		const message: SaveChatMessage = {
			id: crypto.randomUUID(),
			sceneId,
			from,
			text,
			sentAt: new Date().toISOString()
		};
		this.history = [...this.history, message];
		if (isCharacterSpeaker(from)) this.#openedScenes.add(sceneId);
		const saveId = storyRuntime.saveId;
		if (saveId) await saveStore.appendChatMessage(saveId, message);
		return message;
	}
}

export const storySession = new StorySession();
