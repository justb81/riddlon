import { validatePackage, type PackageValidationError } from './validate-package.js';
import type { Clue, Fact, Manifest, Secret, Story, StoryGraph } from './schemas/index.js';

/** Everything `engine/` needs to start a story, already parsed and cross-validated. */
export interface StoryBundle {
	manifest: Manifest;
	story: Story;
	graph: StoryGraph;
	clues: Clue[];
	facts: Fact[];
	secrets: Secret[];
}

export interface LoadStoryBundleResult {
	valid: boolean;
	errors: PackageValidationError[];
	bundle?: StoryBundle;
}

/**
 * Validates `files` via validatePackage() and, only when valid, assembles the parsed
 * pieces into the shape `engine/` consumes. This is the seam #10's ZIP importer feeds —
 * the engine itself never parses raw package files or knows about manifest paths.
 */
export function loadStoryBundle(files: Record<string, unknown>): LoadStoryBundleResult {
	const result = validatePackage(files);
	if (!result.valid || !result.manifest || !result.story || !result.graph) {
		return { valid: false, errors: result.errors };
	}
	return {
		valid: true,
		errors: [],
		bundle: {
			manifest: result.manifest,
			story: result.story,
			graph: result.graph,
			clues: result.clues ?? [],
			facts: result.facts ?? [],
			secrets: result.secrets ?? []
		}
	};
}
