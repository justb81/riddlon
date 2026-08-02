/**
 * Composes "this character, in this scene, of this package" into the input `buildPersonaPrompt`
 * wants — the seam between engine state and the model's instruction.
 *
 * This is pure and lives here rather than inside `state/story-session.svelte.ts` for one concrete
 * reason: the composition is where a character silently loses knowledge. `buildPersonaPrompt` shows
 * a character exactly the facts, secrets and relationships handed to it, so anything this function
 * forgets to pass is something the model can never know — and that failure is invisible at runtime
 * (the story just stops advancing) but trivially assertable in Node.
 */

import type { EffectiveCharacterState } from '$lib/characters/index.js';
import type { StoryBundle } from '$lib/content/index.js';
import { buildPersonaPrompt } from '$lib/llm/persona.js';
import type { ThreadKind } from './story-display.js';

export interface PersonaContext {
	bundle: StoryBundle;
	/** The package's cast, identity merged with this story's binding. */
	cast: readonly EffectiveCharacterState[];
	/** Live engine evaluation of a `revealCondition` — what gates a secret. */
	isConditionMet: (ref: string) => boolean;
	storyTitle: string;
	playerName: string;
}

export interface PersonaThread {
	kind: ThreadKind;
	participantIds: readonly string[];
}

export function buildScenePersonaPrompt(
	ctx: PersonaContext,
	characterId: string,
	sceneId: string,
	thread: PersonaThread,
	opts: { idle?: boolean } = {}
): string {
	const character = ctx.cast.find((c) => c.id === characterId);
	const scene = ctx.bundle.graph.nodes.find((node) => node.id === sceneId);
	const displayNameFor = (id: string) => ctx.cast.find((c) => c.id === id)?.displayName ?? id;

	const knownFacts = new Set(character?.knowledge.publicFacts ?? []);
	const heldSecrets = new Set(character?.knowledge.secrets ?? []);
	// #79: an authored `relevantFactIds`/`relevantSecretIds` list narrows what the scene forwards,
	// on top of what the character's cast binding knows. Absent list (undefined) means no
	// narrowing — every known fact/held secret still goes in, matching pre-#79 behavior.
	const relevantFacts = scene?.relevantFactIds;
	const relevantSecrets = scene?.relevantSecretIds;
	const facts = ctx.bundle.facts.filter(
		(fact) =>
			knownFacts.has(fact.id) && (relevantFacts === undefined || relevantFacts.includes(fact.id))
	);
	const secrets = ctx.bundle.secrets.filter(
		(secret) =>
			heldSecrets.has(secret.id) &&
			(relevantSecrets === undefined || relevantSecrets.includes(secret.id))
	);
	const idle = opts.idle ?? false;

	return buildPersonaPrompt({
		character: {
			id: characterId,
			displayName: character?.displayName ?? characterId,
			voiceStyle: character?.voiceStyle,
			corePersonality: character?.corePersonality,
			roleInStory: character?.roleInStory
		},
		storyTitle: ctx.storyTitle,
		scene: {
			goals: idle ? [] : (scene?.goals ?? []),
			// Idle mode: this scene is already resolved — its goals are known-accomplished, not
			// dropped, so the character can still refer back to them (e.g. thank the player for
			// the help) instead of pretending nothing happened.
			resolvedGoals: idle ? (scene?.goals ?? []) : undefined,
			playerRole: !idle && scene?.type === 'group-chat-scene' ? scene.playerRole : undefined,
			isGroup: thread.kind === 'group',
			otherParticipants: thread.participantIds
				.filter((id) => id !== characterId)
				.map(displayNameFor)
		},
		// The cast binding's own social graph. A solo scene has no `otherParticipants`, so this is
		// the only thing that lets a character name someone who isn't in the room — which is exactly
		// what a goal like "name-max-and-sabine-as-witnesses" asks for.
		relationships: Object.entries(character?.relationships ?? {}).map(([id, relation]) => ({
			displayName: displayNameFor(id),
			relation
		})),
		knowledge: {
			facts: facts.map((fact) => fact.statement),
			// docs/concept.md §5.5: the two lists must stay apart, or a withheld secret reads as
			// something the character may say.
			revealableSecrets: secrets
				.filter((secret) => ctx.isConditionMet(secret.revealCondition))
				.map((secret) => secret.statement),
			withheldSecrets: secrets
				.filter((secret) => !ctx.isConditionMet(secret.revealCondition))
				.map((secret) => secret.statement)
		},
		playerName: ctx.playerName
	});
}
