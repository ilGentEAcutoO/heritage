/**
 * trees.ts — /api/trees routes
 *
 * Coordinator mounts at /api/trees:
 *   GET  /  — requires auth → list owned + accepted-share trees (deduped)
 *   POST /  — requires auth → create new tree
 */

import { Hono } from 'hono';
import { eq, or, and } from 'drizzle-orm';
import { z } from 'zod';
import type { HonoEnv } from '../types';
import * as schema from '../../db/schema';
import { newId } from '../lib/ids';

export const treesRouter = new Hono<HonoEnv>();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

// N-R3-6 remediation: constrain slug shape. The slug lives in URL paths and
// cache keys; allowing arbitrary strings bloats the cache and opens URL-log
// pollution / reserved-prefix collision vectors.
//
// Rules:
//   - 2–64 chars (regex enforces the size bound)
//   - lowercase alpha/num/hyphen only
//   - must start with alpha/num (no leading hyphen)
//
// TODO(RL_WRITE): rate-limit POST /api/trees + POST /api/tree/:slug/shares
// once the RL_WRITE Cloudflare binding is provisioned. See ops/rate-limit.md.
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,63}$/;

const createTreeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(64)
    .regex(SLUG_REGEX, 'slug must be lowercase alphanumeric + hyphen, 2-64 chars'),
  visibility: z.enum(['public', 'private', 'shared']).default('private'),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TreeSummary {
  id: string;
  slug: string;
  name: string;
  name_en: string | null;
  visibility: 'public' | 'private' | 'shared';
  owner_id: string | null;
  role: 'owner' | 'viewer' | 'editor';
  created_at: number;
}

function treeToSummary(
  tree: typeof schema.trees.$inferSelect,
  role: 'owner' | 'viewer' | 'editor',
): TreeSummary {
  const createdAt =
    tree.created_at instanceof Date
      ? Math.floor(tree.created_at.getTime() / 1000)
      : (tree.created_at as unknown as number);

  return {
    id: tree.id,
    slug: tree.slug,
    name: tree.name,
    name_en: tree.name_en ?? null,
    visibility: tree.visibility as 'public' | 'private' | 'shared',
    owner_id: tree.owner_id ?? null,
    role,
    created_at: createdAt,
  };
}

// ---------------------------------------------------------------------------
// GET / — requires auth
// ---------------------------------------------------------------------------

treesRouter.get('/', async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const db = c.var.db;

  // Two queries + client-side merge (UNION via drizzle-orm not yet clean on D1):
  // 1. Trees I own
  const ownedTrees = await db.query.trees.findMany({
    where: eq(schema.trees.owner_id, user.id),
  });

  // 2. Trees where I have an accepted share
  const acceptedShares = await db.query.tree_shares.findMany({
    where: and(
      eq(schema.tree_shares.user_id, user.id),
      eq(schema.tree_shares.status, 'accepted'),
    ),
  });

  // Build result map keyed by tree id — owned takes priority for role
  const treeMap = new Map<string, TreeSummary>();

  for (const tree of ownedTrees) {
    treeMap.set(tree.id, treeToSummary(tree, 'owner'));
  }

  if (acceptedShares.length > 0) {
    const sharedTreeIds = acceptedShares
      .map((s) => s.tree_id)
      .filter((id) => !treeMap.has(id)); // skip already-owned trees

    if (sharedTreeIds.length > 0) {
      // Fetch shared trees by id
      const sharedTrees = await db.query.trees.findMany({
        where: (trees, { inArray }) => inArray(trees.id, sharedTreeIds),
      });

      for (const tree of sharedTrees) {
        const share = acceptedShares.find((s) => s.tree_id === tree.id);
        if (share) {
          treeMap.set(tree.id, treeToSummary(tree, share.role as 'viewer' | 'editor'));
        }
      }
    }
  }

  return c.json({ trees: Array.from(treeMap.values()) });
});

// ---------------------------------------------------------------------------
// POST / — requires auth
// ---------------------------------------------------------------------------

treesRouter.post('/', async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const db = c.var.db;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  // N-R3-6 remediation: strict input validation (trim + lowercase + regex).
  const parsed = createTreeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);
  }
  const { name, slug, visibility: validVisibility } = parsed.data;

  // Check slug uniqueness
  const existing = await db.query.trees.findFirst({
    where: eq(schema.trees.slug, slug),
  });

  if (existing) {
    return c.json({ error: 'slug_taken' }, 409);
  }

  const id = newId();
  await db.insert(schema.trees).values({
    id,
    slug,
    name,
    owner_id: user.id,
    visibility: validVisibility,
  });

  const tree = await db.query.trees.findFirst({
    where: eq(schema.trees.id, id),
  });

  return c.json({ tree: treeToSummary(tree!, 'owner') }, 201);
});
