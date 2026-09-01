import { z } from 'zod';
import { semverSchema, uuidV4Schema } from './common.js';

/** docs/arc42 §8.1.2 */
export const manifestSchema = z.object({
	format: z.literal('chatstory-package'),
	formatVersion: semverSchema,
	id: uuidV4Schema,
	title: z.string().min(1),
	version: semverSchema,
	author: z.string().min(1),
	language: z.string().min(2),
	entryStory: z.string().min(1),
	entryGraph: z.string().min(1),
	characters: z.array(z.string().min(1)),
	world: z.array(z.string().min(1)).default([]),
	assetsBase: z.string().min(1),
	minPlayerVersion: semverSchema,
	capabilities: z.array(z.string()).default([]),
	/**
	 * Free-form classification shown on the library card and the case file (#53). A list rather
	 * than a single `genre`, because a single one immediately wants to be two, and because it is
	 * the obvious sort/filter key once a library holds more than one story. Authored content, so
	 * the strings are in the package's own `language` and never translated by the app.
	 */
	tags: z.array(z.string().min(1)).default([])
});

export type Manifest = z.infer<typeof manifestSchema>;
