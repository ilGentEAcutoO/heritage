/**
 * people.ts — /api/tree/:slug/person/:personId mutations
 *
 * All routes are owner-only. Anti-enumeration: non-owner gets 404, not 403.
 *
 * Coordinator mounts this router at /api/tree so paths resolve as:
 *   PATCH  /api/tree/:slug/person/:personId
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import type { HonoEnv } from '../types';
import * as schema from '../../db/schema';
import { purgeTreeCache } from '../lib/cache-purge';
import { resolveOwnerTree } from '../lib/resolve-owner-tree';

export const peopleRouter = new Hono<HonoEnv>();

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const personStatusSchema = z.object({
  deceased: z.boolean(),
  died: z.number().int().nullable(),
});

// ---------------------------------------------------------------------------
// PATCH /:slug/person/:personId — owner only
// ---------------------------------------------------------------------------

peopleRouter.patch('/:slug/person/:personId', async (c) => {
  const { slug, personId } = c.req.param();

  // 1. Resolve tree + verify ownership (401 no user, 404 no tree / non-owner)
  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json({ error: ctx.status === 401 ? 'unauthorized' : 'not found' }, ctx.status);
  }

  const { db, tree } = ctx;

  // 2. Fetch the person — must belong to this tree (anti-enumeration: 404 not 403)
  const person = await db.query.people.findFirst({
    where: and(
      eq(schema.people.id, personId),
      eq(schema.people.tree_id, tree.id),
    ),
  });

  if (!person) {
    return c.json({ error: 'not found' }, 404);
  }

  // 3. Parse + validate request body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const parsed = personStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }

  let { deceased, died } = parsed.data;

  // 4. Enforce consistency rules
  if (!deceased) {
    // alive → force died to null regardless of what was sent
    died = null;
  } else if (died !== null) {
    // deceased + year → validate the year
    const currentYear = new Date().getFullYear();

    if (died > currentYear) {
      return c.json({ error: 'invalid_year', detail: 'died cannot be in the future' }, 422);
    }

    if (person.born !== null && died < person.born) {
      return c.json({ error: 'invalid_year', detail: 'died cannot be before born' }, 422);
    }
  }

  // 5. Persist
  await db
    .update(schema.people)
    .set({ deceased, died })
    .where(and(eq(schema.people.id, personId), eq(schema.people.tree_id, tree.id)));

  // 6. Purge edge cache so the GET /api/tree/:slug response reflects the change
  await purgeTreeCache(c.req.url, slug);

  return c.json({ deceased, died });
});
