import { describe, expect, it } from 'vitest';
import { sceneNodeSchema, storyGraphSchema } from './sceneGraph.js';

const SCENE_ID = 'b2e4f6a8-1c3d-4e5f-9a7b-0c1d2e3f4a5b';
const TARGET_ID = 'd3e4f5a6-1c3d-4e5f-9a7b-0c1d2e3f4a5d';
const MAX_ID = '8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e';

describe('sceneNodeSchema', () => {
	it('parses the docs/concept.md §5.4 chat-scene example', () => {
		const result = sceneNodeSchema.safeParse({
			id: SCENE_ID,
			type: 'chat-scene',
			participants: [MAX_ID],
			goals: ['seed-timeline', 'seed-suspect-description'],
			entryConditions: ['flag:max-contact-unlocked'],
			exitConditions: ['flag:max-questioned'],
			revealables: ['clue:time-window', 'clue:suspect-description-a'],
			next: [{ target: TARGET_ID, when: ['flag:max-and-sabine-questioned'] }]
		});
		expect(result.success).toBe(true);
	});

	it('parses the docs/concept.md §5.7 group-chat-scene example', () => {
		const result = sceneNodeSchema.safeParse({
			id: SCENE_ID,
			type: 'group-chat-scene',
			participants: [MAX_ID],
			entryConditions: ['flag:hans-info-confirmed'],
			playerRole: 'confront-max-with-evidence',
			outcomes: [{ id: 'max-confesses', condition: 'flag:evidence-presented' }]
		});
		expect(result.success).toBe(true);
	});

	it('defaults suggestedReplies to an empty array when omitted', () => {
		const result = sceneNodeSchema.parse({
			id: SCENE_ID,
			type: 'chat-scene',
			participants: [MAX_ID]
		});
		expect(result.suggestedReplies).toEqual([]);
	});

	it('parses authored suggestedReplies', () => {
		const result = sceneNodeSchema.safeParse({
			id: SCENE_ID,
			type: 'chat-scene',
			participants: [MAX_ID],
			suggestedReplies: ['Wo warst du gestern Abend?', 'Kennst du Lucy?']
		});
		expect(result.success).toBe(true);
	});

	it('rejects an unknown scene type', () => {
		const result = sceneNodeSchema.safeParse({
			id: SCENE_ID,
			type: 'solo-scene',
			participants: []
		});
		expect(result.success).toBe(false);
	});
});

describe('storyGraphSchema', () => {
	it('wraps scene nodes in a { nodes } object', () => {
		const result = storyGraphSchema.safeParse({
			nodes: [{ id: SCENE_ID, type: 'chat-scene', participants: [MAX_ID] }]
		});
		expect(result.success).toBe(true);
	});
});
