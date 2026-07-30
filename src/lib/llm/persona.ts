/**
 * Turns "this character, in this scene, in this story" into the system prompt and turn
 * instructions the local model gets. Pure, so it is testable in Node — the model call itself
 * lives in `state/story-session.svelte.ts`.
 *
 * The material is entirely the package's: identity and voice from the character file, role and
 * knowledge from this story's cast binding, goals from the current scene, and the canon rule
 * from docs/concept.md §5.5 — facts are truths the model must not contradict, secrets are
 * withheld until their `revealCondition` holds.
 */

export interface PersonaCharacter {
	id: string;
	displayName: string;
	voiceStyle?: string;
	corePersonality?: string;
	roleInStory?: string;
}

export interface PersonaScene {
	goals: readonly string[];
	/** Group scenes only (docs/concept.md §5.7). */
	playerRole?: string;
	isGroup: boolean;
	/** Other characters present, for a group scene. */
	otherParticipants: readonly string[];
}

export interface PersonaKnowledge {
	/** Canon statements this character knows, verbatim from `world/facts.json`. */
	facts: readonly string[];
	/** Secrets whose `revealCondition` is satisfied — may come out now. */
	revealableSecrets: readonly string[];
	/** Secrets this character holds but must keep for now. */
	withheldSecrets: readonly string[];
}

function section(heading: string, lines: readonly string[]): string[] {
	if (lines.length === 0) return [];
	return ['', heading, ...lines.map((line) => `- ${line}`)];
}

export function buildPersonaPrompt(input: {
	character: PersonaCharacter;
	storyTitle: string;
	scene: PersonaScene;
	knowledge: PersonaKnowledge;
	playerName: string;
}): string {
	const { character, scene, knowledge } = input;
	const traits = [character.corePersonality, character.voiceStyle].filter(Boolean).join('; ');

	return [
		`Du bist ${character.displayName}, eine Figur in der Geschichte „${input.storyTitle}“.`,
		traits ? `So bist du: ${traits}.` : '',
		character.roleInStory ? `Deine Rolle in dieser Geschichte: ${character.roleInStory}.` : '',
		`Du chattest mit ${input.playerName}.`,
		'',
		'Schreib wie in einem Messenger: kurz, 1-2 Sätze, auf Deutsch, in der Ich-Form.',
		'Bleib immer in der Rolle. Erkläre nie, dass du eine KI bist, und beschreib keine Handlungen',
		'in Sternchen — es ist ein Chat, keine Erzählung.',
		scene.isGroup
			? `Es ist ein Gruppenchat mit: ${scene.otherParticipants.join(', ') || '(niemandem sonst)'}.`
			: '',
		scene.playerRole ? `${input.playerName} will gerade: ${scene.playerRole}.` : '',
		...section('Worauf du in diesem Gespräch hinauswillst:', scene.goals),
		...section('Das ist wahr und darfst du nicht widersprechen:', knowledge.facts),
		...section('Das darfst du jetzt preisgeben, wenn es passt:', knowledge.revealableSecrets),
		...section('Das weißt du, behältst es aber noch für dich:', knowledge.withheldSecrets)
	]
		.filter((line) => line !== '')
		.join('\n');
}

/**
 * The prompt for a scene's first message. A package ships no authored dialogue, so a newly
 * unlocked contact would otherwise sit in an empty thread — the model writes the opener.
 */
export function buildOpeningInstruction(playerName: string): string {
	return [
		`Schreib die erste Nachricht an ${playerName}. Du beginnst das Gespräch.`,
		'Ein bis zwei Sätze, kein Gruß-Monolog, keine Zusammenfassung der Lage.',
		'Antworte nur mit der Nachricht selbst.'
	].join('\n');
}

/**
 * Who answers in a group chat. Name mentions decide; otherwise the first participant does.
 *
 * The package format has no turn-taking rules (docs/concept.md §5.7 defines membership and
 * outcomes, not speaking order), so this is the app's documented choice rather than something
 * read out of the story — deterministic and cheap, and it makes "Max, sag die Wahrheit" reach Max.
 */
export function pickResponder(
	participants: readonly { id: string; displayName: string }[],
	text: string
): string | null {
	if (participants.length === 0) return null;
	const haystack = text.toLowerCase();
	const mentioned = participants.find(
		(p) => p.displayName.length > 1 && haystack.includes(p.displayName.toLowerCase())
	);
	return (mentioned ?? participants[0]).id;
}
