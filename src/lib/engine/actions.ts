/**
 * The action vocabulary fired by `delayedEvents[].action` (docs/arc42 §8.1.6) and
 * reused anywhere else the engine needs to name a mutation as data rather than code. §8.1.6's
 * own worked example only shows `unlock-scene:`; `set-flag:` and `unlock-character:` exist
 * so this is a small open registry rather than a single hardcoded case.
 */
export type EngineAction =
	| { type: 'unlock-scene'; sceneId: string }
	| { type: 'set-flag'; flag: string }
	| { type: 'unlock-character'; characterId: string };

/** Returns `undefined` for an unrecognized prefix — a future/older package must not crash the player. */
export function parseAction(ref: string): EngineAction | undefined {
	const colonIndex = ref.indexOf(':');
	if (colonIndex === -1) return undefined;
	const prefix = ref.slice(0, colonIndex);
	const rest = ref.slice(colonIndex + 1);
	if (rest.length === 0) return undefined;

	switch (prefix) {
		case 'unlock-scene':
			return { type: 'unlock-scene', sceneId: rest };
		case 'set-flag':
			return { type: 'set-flag', flag: rest };
		case 'unlock-character':
			return { type: 'unlock-character', characterId: rest };
		default:
			return undefined;
	}
}
