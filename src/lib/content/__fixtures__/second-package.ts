/**
 * An independently-authored second package that reuses Lucy's UUID from
 * lucys-portmonnaie.ts (same stable identity, different originPackage) with a different
 * castBinding — used by storage/ and characters/ tests to prove UUID-based dedup and
 * that per-story availability state never leaks across stories.
 */
import type { CastBinding, CharacterIdentity, Manifest } from '../schemas/index.js';
import { LUCY_ID } from './lucys-portmonnaie.js';

export const SECOND_PACKAGE_ID = 'aa11bb22-3d4e-4f5a-8b6c-9d0e1f2a3b4c';

export function secondPackageManifest(): Manifest {
	return {
		format: 'chatstory-package',
		formatVersion: '1.0.0',
		id: SECOND_PACKAGE_ID,
		title: 'Mitternacht in Rothenburg',
		version: '0.1.0',
		author: 'Zweite Autorin',
		language: 'de',
		entryStory: 'story/story.json',
		entryGraph: 'story/graph.json',
		characters: [`characters/${LUCY_ID}.character.json`],
		world: [],
		assetsBase: 'assets/',
		minPlayerVersion: '0.1.0',
		capabilities: []
	};
}

/** Same UUID, same displayName, but re-authored identity fields — proves "first write wins". */
export function secondPackageLucyCharacterFile(): CharacterIdentity {
	return {
		id: LUCY_ID,
		slug: 'lucy',
		displayName: 'Lucy',
		avatar: 'assets/avatars/lucy-alt.png',
		voiceStyle: 'ruhig, förmlich',
		corePersonality: 're-authored by a different package',
		originPackage: SECOND_PACKAGE_ID,
		shareable: true
	};
}

/** Lucy is hidden in this story, unlike lucys-portmonnaie.ts where she's visible from the start. */
export function secondPackageLucyCastBinding(): CastBinding {
	return {
		characterRef: LUCY_ID,
		roleInStory: 'red-herring',
		knowledge: { publicFacts: [], secrets: [] },
		availability: { initialState: 'hidden', unlockCondition: 'flag:midnight-bell' },
		relationships: {}
	};
}
