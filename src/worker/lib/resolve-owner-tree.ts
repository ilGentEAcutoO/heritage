/**
 * resolve-owner-tree.ts — shared helper for owner-only route guards.
 *
 * Resolves the tree by slug and verifies the authenticated user is its owner.
 * Anti-enumeration: non-owner (including users who can see the tree via a share)
 * always gets 404, never 403.
 *
 * Used by:
 *   - src/worker/routes/shares.ts
 *   - src/worker/routes/people.ts
 */

import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import type { HonoEnv } from '../types';
import * as schema from '../../db/schema';

export type ResolveResult =
  | { ok: true; tree: typeof schema.trees.$inferSelect; user: NonNullable<HonoEnv['Variables']['user']>; db: HonoEnv['Variables']['db'] }
  | { ok: false; status: 401 | 404 };

/**
 * Resolve the tree + verify ownership.
 *
 * Returns { ok: true, tree, user, db } on success.
 * Returns { ok: false, status: 401 } when no session is present.
 * Returns { ok: false, status: 404 } when the tree is missing or the caller
 * is not the owner (anti-enumeration).
 */
export async function resolveOwnerTree(
  c: Context<HonoEnv>,
  slug: string,
): Promise<ResolveResult> {
  const db = c.var.db;
  const user = c.var.user;

  if (!user) {
    return { ok: false, status: 401 };
  }

  const tree = await db.query.trees.findFirst({
    where: eq(schema.trees.slug, slug),
  });

  if (!tree) {
    return { ok: false, status: 404 };
  }

  if (tree.owner_id !== user.id) {
    // Anti-enumeration: return 404 even when tree exists
    return { ok: false, status: 404 };
  }

  return { ok: true, tree, user, db };
}
