/**
 * Mechanical assembly of conversation history into what the Prompt API wants.
 *
 * Strictly mechanical: nothing here decides *what* a character knows or may reveal. The
 * prompt-template and safety-rule schemas (`rules/prompts.json`, `rules/safety.json`) are open
 * points in docs/arc42 §11, so `systemPrompt` is passed through as an opaque string and the
 * story engine (#7/#8) will own everything semantic.
 */

import type { LlmTurn, PromptApiMessage } from './types.js';

export const DEFAULT_MAX_HISTORY_TURNS = 20;

/**
 * Keeps the most recent `max` turns, and keeps them coherent: a window must not start on an
 * assistant reply whose user message was just dropped, so the start is nudged forward to the next
 * user turn.
 */
export function windowTurns(
	turns: readonly LlmTurn[],
	max: number = DEFAULT_MAX_HISTORY_TURNS
): readonly LlmTurn[] {
	if (max <= 0) return [];
	if (turns.length <= max) return turns;

	const windowed = turns.slice(turns.length - max);
	const firstUser = windowed.findIndex((turn) => turn.role === 'user');
	return firstUser <= 0 ? windowed : windowed.slice(firstUser);
}

/** System prompt plus history, in the shape `LanguageModel.create({ initialPrompts })` expects. */
export function toInitialPrompts(
	systemPrompt: string,
	turns: readonly LlmTurn[] = []
): PromptApiMessage[] {
	const messages: PromptApiMessage[] = [];
	if (systemPrompt.trim()) messages.push({ role: 'system', content: systemPrompt });
	for (const turn of turns) messages.push({ role: turn.role, content: turn.content });
	return messages;
}

export function appendTurn(
	turns: readonly LlmTurn[],
	role: LlmTurn['role'],
	content: string
): LlmTurn[] {
	return [...turns, { role, content }];
}
