import { describe, expect, it } from 'vitest';
import { castBindingSchema } from './castBinding.js';

const LUCY_ID = '3f2a1c9e-7b41-4e3a-9c2d-1a2b3c4d5e6f';
const MAX_ID = '8b6d2f10-4c3a-4a91-9e2b-2f4a6b8c1d3e';

describe('castBindingSchema', () => {
	it('parses the docs/concept.md §5.3 example', () => {
		const result = castBindingSchema.safeParse({
			characterRef: LUCY_ID,
			roleInStory: 'quest-giver',
			knowledge: { publicFacts: ['fact:club-theft'], secrets: ['secret:hans-tip'] },
			availability: { initialState: 'hidden', unlockCondition: 'story-start' },
			relationships: { [MAX_ID]: 'friend' }
		});
		expect(result.success).toBe(true);
	});

	it('defaults availability to visible and relationships to empty when omitted', () => {
		const result = castBindingSchema.parse({ characterRef: LUCY_ID, roleInStory: 'bystander' });
		expect(result.availability).toEqual({ initialState: 'visible' });
		expect(result.relationships).toEqual({});
	});

	it('rejects a relationships key that is not a UUID', () => {
		const result = castBindingSchema.safeParse({
			characterRef: LUCY_ID,
			roleInStory: 'quest-giver',
			relationships: { max: 'friend' }
		});
		expect(result.success).toBe(false);
	});
});
