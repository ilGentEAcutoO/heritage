/**
 * shares.ts — /api/tree/:slug/shares/* and /api/tree/:slug/visibility
 *
 * All routes are owner-only. Anti-enumeration: non-owner gets 404, not 403.
 *
 * Coordinator mounts this router at /api/tree so paths resolve as:
 *   GET    /api/tree/:slug/shares
 *   POST   /api/tree/:slug/shares
 *   DELETE /api/tree/:slug/shares/:shareId
 *   PATCH  /api/tree/:slug/visibility
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import type { HonoEnv } from '../types';
import * as schema from '../../db/schema';
import { newId } from '../lib/ids';
import { purgeTreeCache } from '../lib/cache-purge';

export const sharesRouter = new Hono<HonoEnv>();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Share {
  id: string;
  email: string;
  role: 'viewer' | 'editor';
  status: 'pending' | 'accepted' | 'revoked';
  user_id: string | null;
  invited_by: string;
  created_at: number;
  accepted_at: number | null;
}

const VALID_VISIBILITY = new Set(['public', 'private', 'shared']);

// N-R3-7 remediation: zod-validate invite body (email format + role enum).
// Normalise (trim + lowercase) BEFORE `.email()` so whitespace-padded inputs
// survive the validator, then cap length at RFC-5321 maximum (254).
const inviteSchema = z.object({
  email: z
    .string()
    .transform((e) => e.trim().toLowerCase())
    .pipe(z.string().email().max(254)),
  role: z.enum(['viewer', 'editor']).default('viewer'),
});

// ---------------------------------------------------------------------------
// Helper: resolve tree + verify ownership
// Returns { ok: true, tree, user, db } or { ok: false, status: 401 | 404 }
// ---------------------------------------------------------------------------

type ResolveResult =
  | { ok: true; tree: typeof schema.trees.$inferSelect; user: NonNullable<HonoEnv['Variables']['user']>; db: HonoEnv['Variables']['db'] }
  | { ok: false; status: 401 | 404 };

async function resolveOwnerTree(
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

function rowToShare(row: typeof schema.tree_shares.$inferSelect): Share {
  const createdAt =
    row.created_at instanceof Date
      ? Math.floor(row.created_at.getTime() / 1000)
      : (row.created_at as unknown as number);

  const acceptedAt =
    row.accepted_at == null
      ? null
      : typeof row.accepted_at === 'number'
      ? row.accepted_at
      : Math.floor((row.accepted_at as unknown as Date).getTime() / 1000);

  return {
    id: row.id,
    email: row.email,
    role: row.role as 'viewer' | 'editor',
    status: row.status as 'pending' | 'accepted' | 'revoked',
    user_id: row.user_id ?? null,
    invited_by: row.invited_by,
    created_at: createdAt,
    accepted_at: acceptedAt,
  };
}

// ---------------------------------------------------------------------------
// GET /:slug/shares — owner only
// ---------------------------------------------------------------------------

sharesRouter.get('/:slug/shares', async (c) => {
  const { slug } = c.req.param();
  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json({ error: ctx.status === 401 ? 'unauthorized' : 'not found' }, ctx.status);
  }

  const { db, tree } = ctx;
  const rows = await db.query.tree_shares.findMany({
    where: eq(schema.tree_shares.tree_id, tree.id),
  });

  return c.json({ shares: rows.map(rowToShare) });
});

// ---------------------------------------------------------------------------
// POST /:slug/shares — owner only
// ---------------------------------------------------------------------------

sharesRouter.post('/:slug/shares', async (c) => {
  const { slug } = c.req.param();
  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json({ error: ctx.status === 401 ? 'unauthorized' : 'not found' }, ctx.status);
  }

  const { db, tree, user } = ctx;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  // N-R3-7 remediation: validate email format + role with zod.
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);
  }
  const { email, role: validRole } = parsed.data;

  // Check if an existing verified user has this email
  const existingUser = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  const autoAccept = existingUser != null && existingUser.email_verified_at != null;
  const now = Math.floor(Date.now() / 1000);

  // Try upsert: find existing row by tree_id + email (case-insensitive)
  // SQLite UNIQUE INDEX on (tree_id, lower(email)) — query manually
  const existingShare = await db.query.tree_shares.findFirst({
    where: and(
      eq(schema.tree_shares.tree_id, tree.id),
      eq(schema.tree_shares.email, email),
    ),
  });

  let share: Share;

  if (existingShare) {
    // Upsert: update the existing row
    const updateValues: Partial<typeof schema.tree_shares.$inferInsert> = {
      role: validRole,
      status: autoAccept ? 'accepted' : 'pending',
      invited_by: user.id,
      user_id: autoAccept ? (existingUser?.id ?? null) : null,
      accepted_at: autoAccept ? now : null,
    };

    await db
      .update(schema.tree_shares)
      .set(updateValues)
      .where(eq(schema.tree_shares.id, existingShare.id));

    const updated = await db.query.tree_shares.findFirst({
      where: eq(schema.tree_shares.id, existingShare.id),
    });

    share = rowToShare(updated!);
  } else {
    // Insert new row
    const id = newId();
    await db.insert(schema.tree_shares).values({
      id,
      tree_id: tree.id,
      email,
      role: validRole,
      status: autoAccept ? 'accepted' : 'pending',
      invited_by: user.id,
      user_id: autoAccept ? (existingUser?.id ?? null) : null,
      accepted_at: autoAccept ? now : null,
    });

    const inserted = await db.query.tree_shares.findFirst({
      where: eq(schema.tree_shares.id, id),
    });

    share = rowToShare(inserted!);
  }

  // N-R3-3 remediation: purge edge cache in case the tree was previously
  // cached as public — adding a share doesn't change visibility directly, but
  // purging here keeps symmetry with visibility mutations and future-proofs
  // us against cache-key changes.
  await purgeTreeCache(c.req.url, slug);

  return c.json({ share }, 201);
});

// ---------------------------------------------------------------------------
// DELETE /:slug/shares/:shareId — owner only (soft delete → revoked)
// ---------------------------------------------------------------------------

sharesRouter.delete('/:slug/shares/:shareId', async (c) => {
  const { slug, shareId } = c.req.param();
  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json({ error: ctx.status === 401 ? 'unauthorized' : 'not found' }, ctx.status);
  }

  const { db, tree } = ctx;

  // Verify share belongs to this tree
  const share = await db.query.tree_shares.findFirst({
    where: and(
      eq(schema.tree_shares.id, shareId),
      eq(schema.tree_shares.tree_id, tree.id),
    ),
  });

  if (!share) {
    return c.json({ error: 'not found' }, 404);
  }

  await db
    .update(schema.tree_shares)
    .set({ status: 'revoked' })
    .where(eq(schema.tree_shares.id, shareId));

  // N-R3-3 remediation: purge any cached response for this tree (symmetry with
  // POST /shares and PATCH /visibility — cost is negligible, correctness wins).
  await purgeTreeCache(c.req.url, slug);

  return new Response(null, { status: 204 });
});

// ---------------------------------------------------------------------------
// PATCH /:slug/visibility — owner only
// ---------------------------------------------------------------------------

sharesRouter.patch('/:slug/visibility', async (c) => {
  const { slug } = c.req.param();
  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json({ error: ctx.status === 401 ? 'unauthorized' : 'not found' }, ctx.status);
  }

  const { db, tree } = ctx;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const { visibility } = body as { visibility?: string };

  if (!visibility || !VALID_VISIBILITY.has(visibility)) {
    return c.json(
      { error: 'invalid_visibility', valid: ['public', 'private', 'shared'] },
      422,
    );
  }

  const validVisibility = visibility as 'public' | 'private' | 'shared';

  await db
    .update(schema.trees)
    .set({ visibility: validVisibility })
    .where(eq(schema.trees.id, tree.id));

  // N-R3-3 remediation: purge edge cache so anonymous viewers don't keep
  // seeing the stale (formerly-public) body after a public→private/shared flip.
  await purgeTreeCache(c.req.url, slug);

  return c.json({ visibility: validVisibility });
});
