import type { ChatMessage } from './types.js';

/**
 * Messages from someone else (never `me`, never `system`) newer than `lastReadAt` (#51).
 * Never read (`lastReadAt` undefined) counts everything; a message without `sentAt` can only be
 * counted in that case, so an old record can't inflate a badge once the thread has been read.
 */
export function countUnread(messages: readonly ChatMessage[], lastReadAt?: string): number {
	const readAt = lastReadAt === undefined ? undefined : Date.parse(lastReadAt);
	return messages.filter((m) => {
		if (m.from === 'me' || m.from === 'system') return false;
		if (readAt === undefined) return true;
		if (!m.sentAt) return false;
		return Date.parse(m.sentAt) > readAt;
	}).length;
}
