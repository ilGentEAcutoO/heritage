/**
 * Shared Zod input schemas — used server-side for validation and may be
 * imported by the frontend for client-side form validation.
 *
 * Export pattern: `FooSchema` (Zod schema) + `FooInput` (inferred TS type).
 */

import { z } from 'zod';

const CURRENT_YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Person
// ---------------------------------------------------------------------------

export const PersonInputSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  name_en: z.string().optional(),
  nick: z.string().optional(),
  born: z
    .number()
    .int()
    .positive()
    .max(CURRENT_YEAR, `born must be <= ${CURRENT_YEAR}`)
    .optional(),
  died: z
    .number()
    .int()
    .positive()
    .max(CURRENT_YEAR, `died must be <= ${CURRENT_YEAR}`)
    .optional(),
  gender: z.enum(['m', 'f']).optional(),
  hometown: z.string().optional(),
  is_me: z.boolean().optional(),
  external: z.boolean().optional(),
  avatar_key: z.string().optional(),
});

export type PersonInput = z.infer<typeof PersonInputSchema>;

export const PersonPatchSchema = PersonInputSchema.partial();
export type PersonPatch = z.infer<typeof PersonPatchSchema>;

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export const StoryInputSchema = z.object({
  year: z.number().int().optional(),
  title: z.string().min(1).optional(),
  body: z.string().max(4096, 'Body must be 4 KB or less'),
  personId: z.string().min(1, 'personId is required'),
});

export type StoryInput = z.infer<typeof StoryInputSchema>;

// ---------------------------------------------------------------------------
// Memo
// ---------------------------------------------------------------------------

export const MemoInputSchema = z.object({
  duration: z.number().int().positive('duration must be > 0'),
  title: z.string().min(1),
  recorded_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date YYYY-MM-DD'),
  by_id: z.string().optional(),
  object_key: z.string().optional(),
  personId: z.string().min(1, 'personId is required'),
});

export type MemoInput = z.infer<typeof MemoInputSchema>;

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

export const TreeInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  name: z.string().min(1),
  name_en: z.string().optional(),
  is_public: z.boolean().default(false),
});

export type TreeInput = z.infer<typeof TreeInputSchema>;

// ---------------------------------------------------------------------------
// Relation
// ---------------------------------------------------------------------------

export const RelationInputSchema = z.object({
  from_id: z.string().min(1),
  to_id: z.string().min(1),
  kind: z.enum(['parent', 'spouse']),
});

export type RelationInput = z.infer<typeof RelationInputSchema>;

// ---------------------------------------------------------------------------
// Position overrides
// ---------------------------------------------------------------------------

export const PositionOverrideItemSchema = z.object({
  personId: z.string().min(1),
  dx: z.number(),
  dy: z.number(),
});

export const PositionOverridesInputSchema = z.object({
  overrides: z.array(PositionOverrideItemSchema).min(1).max(500),
});

export type PositionOverridesInput = z.infer<typeof PositionOverridesInputSchema>;
