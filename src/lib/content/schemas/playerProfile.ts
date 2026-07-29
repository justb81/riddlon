import { z } from 'zod';

const pronounsSchema = z.object({
	subject: z.string().min(1),
	object: z.string().min(1),
	possessive: z.string().min(1)
});

/**
 * docs/concept.md §6 gives two alternative shapes — a minimal one keyed on `addressAs`
 * and an extended one with a structured `pronouns` object. Treated here as alternates of
 * the same concern: at least one of the two must be present.
 */
export const playerProfileSchema = z
	.object({
		displayName: z.string().min(1).optional(),
		addressAs: z.string().min(1).optional(),
		pronouns: pronounsSchema.optional(),
		avatar: z.string().optional(),
		shortBio: z.string().optional()
	})
	.refine((profile) => profile.addressAs !== undefined || profile.pronouns !== undefined, {
		message: 'playerProfile requires either "addressAs" or "pronouns"'
	});

export type PlayerProfile = z.infer<typeof playerProfileSchema>;
