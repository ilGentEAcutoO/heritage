/**
 * Shared Zod input schemas — used server-side for validation and may be
 * imported by the frontend for client-side form validation.
 *
 * Export pattern: `FooSchema` (Zod schema) + `FooInput` (inferred TS type).
 */

import { z } from 'zod';

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
