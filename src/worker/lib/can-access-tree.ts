/**
 * can-access-tree.ts — visibility gate for tree read routes.
 *
 * Implements the access matrix from research-005 §7:
 *   public  → always true
 *   private → owner only
 *   shared  → owner OR accepted share
 *
 * Fails closed (returns false) on any DB error.
 */

import type { DB } from '../../db/client';
import { tree_shares } from '../../db/schema';
import { and, eq } from 'drizzle-orm';

export type TreeVisibility = 'public' | 'private' | 'shared';

export interface TreeForGate {
  id: string;
  /** 'public' | 'private' | 'shared' — string fallback for un-migrated rows */
  visibility: TreeVisibility | string;
  owner_id: string | null;
}

/**
 * Returns true if the user can read the tree, false otherwise.
 *
 * - public  → always true (no auth required)
 * - private → owner only (userId must match owner_id exactly)
 * - shared  → owner OR user has an accepted tree_share row
 *
 * If owner_id IS NULL and visibility is NOT 'public', fails closed.
 * On any DB error, returns false (fail-closed).
 */
export async function canAccessTree(
  db: DB,
  tree: TreeForGate,
  userId: string | null,
): Promise<boolean> {
  const vis = tree.visibility;

  // public — anyone can read
  if (vis === 'public') return true;

  // private — owner only
  if (vis === 'private') {
    if (!userId || !tree.owner_id) return false;
    return userId === tree.owner_id;
  }

  // shared — owner or accepted share
  if (vis === 'shared') {
    if (!userId) return false;
    if (tree.owner_id && userId === tree.owner_id) return true;

    // Look for an accepted share row
    try {
      const rows = await db
        .select({ id: tree_shares.id })
        .from(tree_shares)
        .where(
          and(
            eq(tree_shares.tree_id, tree.id),
            eq(tree_shares.user_id, userId),
            eq(tree_shares.status, 'accepted'),
          ),
        )
        .limit(1)
        .all();

      return rows.length > 0;
    } catch {
      // Fail closed on any DB error
      return false;
    }
  }

  // Unknown visibility string — fail closed
  return false;
}
