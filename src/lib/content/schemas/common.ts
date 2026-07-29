import { z } from 'zod';
import { parseSemver } from '../semver.js';

/**
 * Story-package entities split into two id namespaces (docs/concept.md §5.1 says every
 * referenceable entity gets a UUIDv4, but §5.4-§5.6's own worked examples give
 * clues/facts/secrets/flags/delayed-events readable "prefix:name" strings instead). This
 * schema module resolves that contradiction: `uuidV4Schema` for structural/linkable entities
 * (characters, packages, scene nodes, and references to them), `symbolicRefSchema` for
 * free-form content tags (flags, clue/fact/secret ids, delayed-event ids) that are never
 * deduped or cross-referenced outside their own file.
 */
export const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uuidV4Schema = z.string().regex(UUID_V4_RE, 'must be a UUIDv4');
export type Uuid = z.infer<typeof uuidV4Schema>;

export const symbolicRefSchema = z
	.string()
	.min(1)
	.regex(/^[\w.-]+(?::[\w.-]+)*$/, 'must be a non-empty, colon-segmented tag');

export const semverSchema = z
	.string()
	.refine((value) => parseSemver(value) !== undefined, 'must be a semver string like "1.0.0"');

/** ISO-8601 duration, e.g. "PT2H" — requires at least one designator. */
export const isoDurationSchema = z
	.string()
	.regex(
		/^P(?!$)(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?!$)(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/,
		'must be an ISO-8601 duration like "PT2H"'
	);
