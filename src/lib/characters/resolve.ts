import type { CastBinding, CharacterIdentity } from '$lib/content/index.js';

export interface EffectiveCharacterState {
	id: string;
	displayName: string;
	avatar?: string;
	voiceStyle?: string;
	corePersonality?: string;
	roleInStory?: string;
	knowledge: { publicFacts: string[]; secrets: string[] };
	availability: { state: 'hidden' | 'visible'; unlockCondition?: string };
	/** Scoped strictly to the ONE story this binding came from. */
	relationships: Record<string, string>;
	/** docs/concept.md §7's "Unbekannt" opening beat (issue #31) — a story-scoped override of
	 *  `displayName` until `revealCondition` holds. Always from `binding`, never `identity`. */
	identityMask?: { maskedDisplayName: string; revealCondition: string };
}

/**
 * Merges a story-independent CharacterIdentity with exactly one CastBinding from the
 * current story only. Identity fields (displayName/avatar/voiceStyle/corePersonality)
 * always come from `identity`; binding-only fields (roleInStory/knowledge/availability/
 * relationships) always come from `binding`. Cross-story leakage is impossible by
 * construction: this function never caches or remembers a binding across calls — every
 * caller must fetch `binding` fresh from the story it currently cares about (e.g. via
 * `storyRegistry.getManifest(currentPackageId)`'s castBindings).
 */
export function resolveEffectiveCharacterState(
	identity: CharacterIdentity,
	binding: CastBinding | undefined
): EffectiveCharacterState {
	if (!binding) {
		return {
			id: identity.id,
			displayName: identity.displayName,
			avatar: identity.avatar,
			voiceStyle: identity.voiceStyle,
			corePersonality: identity.corePersonality,
			knowledge: { publicFacts: [], secrets: [] },
			availability: { state: 'hidden' },
			relationships: {}
		};
	}
	return {
		id: identity.id,
		displayName: identity.displayName,
		avatar: identity.avatar,
		voiceStyle: identity.voiceStyle,
		corePersonality: identity.corePersonality,
		roleInStory: binding.roleInStory,
		knowledge: binding.knowledge,
		availability: {
			state: binding.availability.initialState,
			unlockCondition: binding.availability.unlockCondition
		},
		relationships: binding.relationships,
		identityMask: binding.identityMask
	};
}

/** "What does character X know" */
export function knows(state: EffectiveCharacterState, ref: string): boolean {
	return state.knowledge.publicFacts.includes(ref) || state.knowledge.secrets.includes(ref);
}

/** "Is X unlocked yet" */
export function isUnlocked(state: EffectiveCharacterState): boolean {
	return state.availability.state === 'visible';
}

/** "What's X's relationship to Y in this story" */
export function relationshipTo(
	state: EffectiveCharacterState,
	otherCharacterId: string
): string | undefined {
	return state.relationships[otherCharacterId];
}
