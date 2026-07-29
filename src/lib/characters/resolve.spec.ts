import { describe, expect, it } from 'vitest';
import { isUnlocked, knows, relationshipTo, resolveEffectiveCharacterState } from './resolve.js';
import type { CastBinding, CharacterIdentity, Story } from '$lib/content/index.js';
import {
	buildValidPackageFiles,
	LUCY_ID,
	MAX_ID,
	SABINE_ID
} from '$lib/content/__fixtures__/lucys-portmonnaie.js';
import { secondPackageLucyCastBinding } from '$lib/content/__fixtures__/second-package.js';

const files = buildValidPackageFiles();
const story = files['story/story.json'] as Story;

function identityFor(id: string, displayName: string): CharacterIdentity {
	return {
		id,
		displayName,
		originPackage: '7e9c1a2b-3d4e-4f5a-8b6c-9d0e1f2a3b4c',
		shareable: true
	};
}

function bindingFor(characterId: string): CastBinding {
	return story.castBindings.find((binding) => binding.characterRef === characterId)!;
}

describe('resolveEffectiveCharacterState — docs/concept.md §7 validation story', () => {
	it('resolves Lucy as visible quest-giver, knowing the club-theft fact', () => {
		const state = resolveEffectiveCharacterState(identityFor(LUCY_ID, 'Lucy'), bindingFor(LUCY_ID));
		expect(state.roleInStory).toBe('quest-giver');
		expect(isUnlocked(state)).toBe(true);
		expect(knows(state, 'fact:club-theft')).toBe(true);
		expect(relationshipTo(state, MAX_ID)).toBe('friend');
	});

	it('resolves Max and Sabine as hidden witnesses until story-start unlocks them', () => {
		const max = resolveEffectiveCharacterState(identityFor(MAX_ID, 'Max'), bindingFor(MAX_ID));
		const sabine = resolveEffectiveCharacterState(
			identityFor(SABINE_ID, 'Sabine'),
			bindingFor(SABINE_ID)
		);
		expect(isUnlocked(max)).toBe(false);
		expect(max.availability.unlockCondition).toBe('story-start');
		expect(isUnlocked(sabine)).toBe(false);
		expect(relationshipTo(max, SABINE_ID)).toBe('friend');
	});

	it('returns a safe hidden default when a character has no binding in this story', () => {
		const state = resolveEffectiveCharacterState(identityFor(LUCY_ID, 'Lucy'), undefined);
		expect(state.availability).toEqual({ state: 'hidden' });
		expect(state.knowledge).toEqual({ publicFacts: [], secrets: [] });
		expect(state.roleInStory).toBeUndefined();
	});

	it("does not leak one story's hidden binding into a different story's binding for the same identity", () => {
		const identity = identityFor(LUCY_ID, 'Lucy');
		const inLucysPortmonnaie = resolveEffectiveCharacterState(identity, bindingFor(LUCY_ID));
		const inSecondPackage = resolveEffectiveCharacterState(
			identity,
			secondPackageLucyCastBinding()
		);

		expect(inLucysPortmonnaie.availability.state).toBe('visible');
		expect(inSecondPackage.availability.state).toBe('hidden');
		// identity itself is unaffected by which story's binding was used
		expect(inLucysPortmonnaie.id).toBe(inSecondPackage.id);
		expect(inLucysPortmonnaie.displayName).toBe(inSecondPackage.displayName);
	});
});
