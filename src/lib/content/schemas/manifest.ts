import { z } from 'zod';
import { semverSchema, uuidV4Schema } from './common.js';

/** docs/concept.md §5.2 */
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
	capabilities: z.array(z.string()).default([])
});

export type Manifest = z.infer<typeof manifestSchema>;
