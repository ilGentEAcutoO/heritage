/**
 * Gated image proxy:
 *   GET /api/img/*  — serve R2 object; gated by tree visibility / auth
 *
 * Access rules:
 *   - If photo's tree is_public → serve to anyone (with KV rate-limit)
 *   - Else → require valid session with tree membership
 *
 * Key is the full path after /api/img/ (may contain slashes, e.g. photos/abc/XYZ.jpg).
 *
 * Cache headers:
 *   - Public tree:   Cache-Control: public, max-age=86400
 *   - Authed access: Cache-Control: private, max-age=3600
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { HonoEnv } from '../types';
import { sessionMiddleware } from '../middleware/session';
import { schema } from '../../db/client';

// ---------------------------------------------------------------------------
// KV rate-limit helpers (simple fixed-window, 60 req / min / IP for public)
// ---------------------------------------------------------------------------

const RL_WINDOW_SECS = 60;
const RL_MAX = 60;

async function checkPublicRateLimit(
  kv: KVNamespace,
  ip: string,
): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / RL_WINDOW_SECS);
  const kvKey = `img_rl:${ip}:${window}`;
  const raw = await kv.get(kvKey);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= RL_MAX) return false; // rate limited
  await kv.put(kvKey, String(count + 1), { expirationTtl: RL_WINDOW_SECS * 2 });
  return true;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const img = new Hono<HonoEnv>();

// Optionally load session (but don't require it — anon may access public trees)
img.use('*', sessionMiddleware);

/**
 * GET /api/img/:key{.+}
 *
 * The `:key{.+}` pattern captures the full path segment including slashes,
 * which handles keys like `photos/person-001/ULID.jpg`.
 *
 * Mounted at /api/img in the main router; the pattern starts at the char
 * after the mount prefix, so `/api/img/photos/x/y.jpg` → key = `photos/x/y.jpg`.
 */
img.get('/:key{.+}', async (c) => {
  const db = c.var.db;

  // Extract the full R2 key from the wildcard path param
  const key = c.req.param('key') ?? '';

  if (!key) {
    return c.json({ error: 'missing_key' }, 400);
  }

  // Look up the photo row (finalized only — object_key === key, not pending:key)
  const photo = await db.query.photos.findFirst({
    where: eq(schema.photos.object_key, key),
  });

  if (!photo) {
    return c.json({ error: 'not_found' }, 404);
  }

  // Resolve the tree to check is_public
  const person = await db.query.people.findFirst({
    where: eq(schema.people.id, photo.person_id),
    columns: { tree_id: true },
  });

  if (!person) {
    return c.json({ error: 'not_found' }, 404);
  }

  const tree = await db.query.trees.findFirst({
    where: eq(schema.trees.id, person.tree_id),
    columns: { id: true, is_public: true },
  });

  if (!tree) {
    return c.json({ error: 'not_found' }, 404);
  }

  const isPublic = tree.is_public;

  if (isPublic) {
    // Rate-limit public access by IP
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
    const allowed = await checkPublicRateLimit(c.env.KV_RL, ip);
    if (!allowed) {
      return c.json({ error: 'rate_limited' }, 429);
    }
  } else {
    // Private tree: require auth + membership
    const user = c.var.user;
    if (!user) {
      return c.json({ error: 'unauthenticated' }, 401);
    }

    const membership = await db.query.tree_members.findFirst({
      where: and(
        eq(schema.tree_members.tree_id, tree.id),
        eq(schema.tree_members.user_id, user.id),
      ),
      columns: { role: true },
    });

    if (!membership) {
      return c.json({ error: 'forbidden' }, 403);
    }
  }

  // Fetch from R2
  const obj = await c.env.PHOTOS.get(key);
  if (!obj) {
    return c.json({ error: 'not_found' }, 404);
  }

  const cacheControl = isPublic ? 'public, max-age=86400' : 'private, max-age=3600';
  const mime = photo.mime ?? 'application/octet-stream';
  const etag = obj.httpEtag;

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': cacheControl,
      ...(etag ? { ETag: etag } : {}),
    },
  });
});

export default img;
