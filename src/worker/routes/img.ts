/**
 * Image proxy:
 *   GET /api/img/*  — serve R2 object; gated by tree visibility
 *
 * Access rules:
 *   - If photo's tree is_public → serve (with KV rate-limit)
 *   - Else → 403 (auth has been removed; private trees are inaccessible)
 *
 * Key is the full path after /api/img/ (may contain slashes, e.g. photos/<treeId>/<personId>/<ULID>.jpg).
 *
 * Security hardening (PR-2):
 *   - C3: IP trust — only `cf-connecting-ip` is trusted. The `x-forwarded-for`
 *     header is never read because on the Cloudflare Workers edge it is
 *     client-controllable and would let an attacker forge the rate-limit bucket.
 *     Requests without a `cf-connecting-ip` fall into a shared `__unknown__`
 *     bucket with a stricter cap.
 *   - H3: Rate-limit hardening — per-IP and per-tree fixed-window counters in
 *     KV. KV is eventually consistent + non-atomic, so a rapid burst can
 *     overshoot the cap by a small margin (this is a known tolerated race).
 *     The per-tree secondary cap bounds the worst case so a single tree cannot
 *     monopolize the limiter budget. A future PR may migrate the hot path to a
 *     Durable Object for true atomic increments.
 *   - H5: Only keys matching the post-PR-2 layout
 *       `photos/<treeId>/<personId>/<ULID>.<ext>`
 *     are accepted. Older pre-PR-2 keys (`photos/<personId>/<ULID>.<ext>`) now
 *     return 404 — the demo seed has been migrated in TASK-202/203.
 *   - H6: Hardened response headers on 200: `X-Content-Type-Options: nosniff`,
 *     `Content-Disposition: inline; filename="<sanitized>"`,
 *     `Cache-Control: public, max-age=60`, `Vary: Cookie`.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { HonoEnv } from '../types';
import { schema } from '../../db/client';

// ---------------------------------------------------------------------------
// Rate-limit config
// ---------------------------------------------------------------------------

const RL_WINDOW_SECS = 60;
const RL_MAX = 60;
/** Stricter cap for requests that arrive without a trusted IP header. */
const RL_MAX_UNKNOWN = Math.floor(RL_MAX / 4); // 15
/** Secondary cap per-tree so a single public tree cannot monopolize. */
const RL_MAX_PER_TREE = 300;
/** Sentinel used when `cf-connecting-ip` is absent. */
const UNKNOWN_IP = '__unknown__';

// ---------------------------------------------------------------------------
// R2 key shape validation (H5)
// ---------------------------------------------------------------------------

/**
 * Accept only the post-PR-2 tree-scoped layout:
 *   photos/<tree-id>/<person-id>/<ULID>.<ext>
 *
 * - tree-id / person-id: lowercase alphanumerics + hyphen
 * - ULID-ish suffix: 26 chars of Crockford-base32 (uppercase A-Z / 0-9)
 * - ext: jpg | jpeg | png | webp
 *
 * Anything else (including path-traversal attempts like `..%2F..`) is rejected
 * with 404 — we deliberately don't return 400 so we don't disclose key shape.
 */
const KEY_RE = /^photos\/[a-z0-9-]+\/[a-z0-9-]+\/[A-Z0-9]{26}\.(jpe?g|png|webp)$/;

function isValidKey(key: string): boolean {
  return KEY_RE.test(key);
}

// ---------------------------------------------------------------------------
// Filename sanitization (H6)
// ---------------------------------------------------------------------------

/**
 * Derive a safe `filename=` value for Content-Disposition from the key's last
 * path segment. Strips path separators, NUL, and control chars. If nothing
 * survives, fall back to `photo`.
 */
function sanitizeFilename(key: string): string {
  const last = key.split('/').pop() ?? '';
  // Strip anything that isn't safe in a filename= quoted-string. Also strip
  // control chars (< 0x20 and DEL) explicitly.
  // eslint-disable-next-line no-control-regex
  const cleaned = last.replace(/[\\/\x00-\x1f\x7f"]/g, '');
  return cleaned.length > 0 ? cleaned : 'photo';
}

// ---------------------------------------------------------------------------
// KV rate-limit helpers
// ---------------------------------------------------------------------------

/**
 * Per-IP fixed-window limiter. Returns true if the request is allowed.
 *
 * KV get + put is not atomic, so under concurrent bursts the cap may be
 * slightly exceeded. Documented and accepted; per-tree cap below bounds the
 * worst case.
 */
async function checkIpRateLimit(
  kv: KVNamespace,
  ip: string,
): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / RL_WINDOW_SECS);
  const kvKey = `img_rl:${ip}:${window}`;
  const max = ip === UNKNOWN_IP ? RL_MAX_UNKNOWN : RL_MAX;
  const raw = await kv.get(kvKey);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= max) return false;
  await kv.put(kvKey, String(count + 1), { expirationTtl: RL_WINDOW_SECS * 2 });
  return true;
}

/** Per-tree fixed-window limiter. Same semantics, different key space. */
async function checkTreeRateLimit(
  kv: KVNamespace,
  treeId: string,
): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / RL_WINDOW_SECS);
  const kvKey = `img_rl_tree:${treeId}:${window}`;
  const raw = await kv.get(kvKey);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= RL_MAX_PER_TREE) return false;
  await kv.put(kvKey, String(count + 1), { expirationTtl: RL_WINDOW_SECS * 2 });
  return true;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const img = new Hono<HonoEnv>();

/**
 * GET /api/img/:key{.+}
 *
 * The `:key{.+}` pattern captures the full path segment including slashes,
 * which handles keys like `photos/<treeId>/<personId>/<ULID>.jpg`.
 */
img.get('/:key{.+}', async (c) => {
  const db = c.var.db;

  // Extract the full R2 key from the wildcard path param
  const key = c.req.param('key') ?? '';

  if (!key) {
    return c.json({ error: 'not_found' }, 404);
  }

  // H5 — reject keys that don't match the tree-scoped ULID layout. Use 404 so
  // we never disclose key structure on probing.
  if (!isValidKey(key)) {
    return c.json({ error: 'not_found' }, 404);
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

  if (!tree.is_public) {
    return c.json({ error: 'forbidden' }, 403);
  }

  // C3 — trust only cf-connecting-ip. Do NOT fall back to x-forwarded-for.
  const ip = c.req.header('cf-connecting-ip') ?? UNKNOWN_IP;

  // Per-IP rate limit (stricter cap for UNKNOWN_IP)
  const ipAllowed = await checkIpRateLimit(c.env.KV_RL, ip);
  if (!ipAllowed) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  // H3 — secondary per-tree cap so one public tree can't monopolize the budget
  const treeAllowed = await checkTreeRateLimit(c.env.KV_RL, tree.id);
  if (!treeAllowed) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  // Fetch from R2
  const obj = await c.env.PHOTOS.get(key);
  if (!obj) {
    return c.json({ error: 'not_found' }, 404);
  }

  const mime = photo.mime ?? 'application/octet-stream';
  const etag = obj.httpEtag;
  const filename = sanitizeFilename(key);

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'public, max-age=60',
      Vary: 'Cookie',
      ...(etag ? { ETag: etag } : {}),
    },
  });
});

export default img;
