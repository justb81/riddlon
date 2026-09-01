import { describe, expect, it } from 'vitest';
import type { StoryBundle } from '$lib/content/index.js';
import { buildSeedChatMessages } from './seed-chats.js';

const PKG = '11111111-1111-4111-8111-111111111111';
const MAX = '33333333-3333-4333-8333-333333333333';
const SCENE_MAX = '55555555-5555-4555-8555-555555555555';
const SCENE_UNKNOWN = '66666666-6666-4666-8666-666666666666';
const T0 = Date.parse('2026-03-01T12:00:00.000Z');

function bundle(seedChats: StoryBundle['story']['seedChats']): StoryBundle {
	return {
		manifest: {
			format: 'chatstory-package',
			formatVersion: '1.1.0',
			id: PKG,
			title: 'Seed Chat Test Story',
			version: '1.0.0',
			author: 'Test',
			language: 'de',
			entryStory: 'story/story.json',
			entryGraph: 'story/graph.json',
			characters: [],
			world: [],
			assetsBase: 'assets/',
			minPlayerVersion: '0.1.0',
			capabilities: [],
			tags: []
		},
		story: { castBindings: [], achievements: [], delayedEvents: [], seedChats },
		graph: {
			nodes: [
				{
					id: SCENE_MAX,
					type: 'chat-scene',
					participants: [MAX],
					goals: [],
					suggestedReplies: [],
					autoOpen: false,
					entryConditions: [],
					exitConditions: ['flag:max-questioned'],
					revealables: [],
					next: []
				}
			]
		},
		clues: [],
		facts: [],
		secrets: []
	};
}

let counter = 0;
const newId = () => `seed-${++counter}`;

describe('buildSeedChatMessages', () => {
	it('dates every message backwards from the start of the playthrough', () => {
		counter = 0;
		const messages = buildSeedChatMessages(
			bundle([
				{
					sceneRef: SCENE_MAX,
					messages: [
						{ from: MAX, text: 'Kommst du am Samstag mit?', offset: 'P2D' },
						{ from: 'me', text: 'Klar.', offset: 'PT47H' }
					]
				}
			]),
			{ startedAt: T0, newId }
		);

		expect(messages).toEqual([
			{
				id: 'seed-1',
				sceneId: SCENE_MAX,
				from: MAX,
				text: 'Kommst du am Samstag mit?',
				sentAt: '2026-02-27T12:00:00.000Z',
				seed: true
			},
			{
				id: 'seed-2',
				sceneId: SCENE_MAX,
				from: 'me',
				text: 'Klar.',
				sentAt: '2026-02-27T13:00:00.000Z',
				seed: true
			}
		]);
	});

	it('marks every message as seed, so a thread open still sends the real opening message', () => {
		counter = 0;
		const messages = buildSeedChatMessages(
			bundle([{ sceneRef: SCENE_MAX, messages: [{ from: MAX, text: 'Hey', offset: 'PT30M' }] }]),
			{ startedAt: T0, newId }
		);
		expect(messages.every((message) => message.seed === true)).toBe(true);
	});

	it('orders a history authored out of sequence oldest-first', () => {
		counter = 0;
		const messages = buildSeedChatMessages(
			bundle([
				{
					sceneRef: SCENE_MAX,
					messages: [
						{ from: MAX, text: 'zuletzt', offset: 'PT10M' },
						{ from: MAX, text: 'zuerst', offset: 'P1D' }
					]
				}
			]),
			{ startedAt: T0, newId }
		);
		expect(messages.map((message) => message.text)).toEqual(['zuerst', 'zuletzt']);
	});

	it('skips a seed chat whose scene the graph does not contain', () => {
		counter = 0;
		const messages = buildSeedChatMessages(
			bundle([
				{ sceneRef: SCENE_UNKNOWN, messages: [{ from: MAX, text: 'Hey', offset: 'PT5M' }] },
				{ sceneRef: SCENE_MAX, messages: [{ from: MAX, text: 'Da', offset: 'PT5M' }] }
			]),
			{ startedAt: T0, newId }
		);
		expect(messages.map((message) => message.text)).toEqual(['Da']);
	});

	it('returns nothing for a package that ships no seed chats', () => {
		const messages = buildSeedChatMessages(bundle([]), { startedAt: T0, newId });
		expect(messages).toEqual([]);
	});
});
