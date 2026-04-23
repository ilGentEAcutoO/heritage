/**
 * tree.ts — /api/tree/* read-only routes
 *
 * Public:
 *   GET /api/tree/:slug  → full tree snapshot (TreeQueryResult)
 *
 * Access is gated by canAccessTree():
 *   - public  → always allowed
 *   - private → owner only
 *   - shared  → owner or accepted share
 * All non-access cases return 404 (anti-enumeration; never 401/403).
 *
 * Perf Fix 1 — edge cache:
 *   Public trees with no __Host-session cookie are cached in caches.default
 *   with Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=300.
 *   Authed or non-public responses get Cache-Control: private, no-store.
 *
 * X-Cache header (internal only — strip at CDN if desired):
 *   HIT  → response served from caches.default
 *   MISS → response computed and stored into caches.default
 */

import { Hono } from 'hono';
import type { HonoEnv } from '../types';
import { getTreeData } from '../lib/tree-query';
import { canAccessTree } from '../lib/can-access-tree';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the request carries a __Host-session cookie.
 * Uses a fast substring check rather than full cookie parsing.
 */
function hasSessionCookie(cookieHeader: string | null | undefined): boolean {
  return Boolean(cookieHeader && String(cookieHeader).includes('__Host-session='));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const treeRouter = new Hono<HonoEnv>();

// ---------------------------------------------------------------------------
// GET /api/tree/:slug  — gated read (visibility-aware) + edge cache
// ---------------------------------------------------------------------------

treeRouter.get('/:slug', async (c) => {
  const db = c.var.db;
  const { slug } = c.req.param();

  const cookieHeader = c.req.header('Cookie');
  const authed = hasSessionCookie(cookieHeader);

  // Build cache key for caches.default (Workers Cache API).
  // Only attempt cache lookup for requests that could be cached (no session cookie).
  const cacheKey = new Request(c.req.url);

  // 1. For public-eligible requests (no session cookie), try cache first.
  if (!authed && typeof caches !== 'undefined') {
    // Workers runtime exposes caches.default; DOM CacheStorage type lacks it — cast inside guard.
    const cfCaches = caches as unknown as { default: Cache };
    try {
      const cached = await cfCaches.default.match(cacheKey);
      if (cached) {
        // Clone and add X-Cache: HIT header to the cached response.
        const headers = new Headers(cached.headers);
        headers.set('X-Cache', 'HIT');
        return new Response(cached.body, {
          status: cached.status,
          headers,
        });
      }
    } catch {
      // caches.default unavailable or failed — proceed to compute
    }
  }

  // 2. Fetch tree data
  const data = await getTreeData(db, slug);
  if (!data) return c.json({ error: 'not found' }, 404);

  // 3. Gate — anti-enumeration: deny looks like not found
  const userId = c.var.user?.id ?? null;
  const allowed = await canAccessTree(
    db,
    { id: data.tree.id, visibility: data.tree.visibility, owner_id: data.tree.ownerId },
    userId,
  );
  if (!allowed) return c.json({ error: 'not found' }, 404);

  // 4. Build response with appropriate cache headers
  const isPublicEligible = data.tree.visibility === 'public' && !authed;

  // N-R3-5 remediation: redact ownerId on anonymous public reads so a stable
  // user identifier isn't surfaced to unauthenticated viewers (prevents
  // cross-tree owner correlation + anonymous "who runs this tree" discovery).
  // Authed viewers / private / shared reads keep ownerId so the frontend can
  // gate owner-only UI (share button in TreeView, etc.).
  //
  // Cloned body shape — do NOT mutate `data` in place: the cache write below
  // must store the sanitised body, and `data` could in principle be reused
  // elsewhere if the query layer ever memoizes.
  const body = JSON.stringify(
    isPublicEligible
      ? { ...data, tree: { ...data.tree, ownerId: null } }
      : data,
  );

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (isPublicEligible) {
    headers['Cache-Control'] = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300';
    headers['Vary'] = 'Cookie';
    headers['X-Cache'] = 'MISS';
  } else {
    headers['Cache-Control'] = 'private, no-store';
  }

  const res = new Response(body, { status: 200, headers });

  // 5. Store public responses in caches.default (Perf Fix 1)
  // Probe executionCtx safely — accessing it in test env throws.
  if (isPublicEligible && typeof caches !== 'undefined') {
    // Workers runtime exposes caches.default; DOM CacheStorage type lacks it — cast inside guard.
    const cfCachesStore = caches as unknown as { default: Cache };
    const toStore = res.clone();
    let ctx: ExecutionContext | undefined;
    try {
      ctx = c.executionCtx;
    } catch {
      ctx = undefined;
    }
    try {
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(cfCachesStore.default.put(cacheKey, toStore));
      } else {
        await cfCachesStore.default.put(cacheKey, toStore);
      }
    } catch {
      // Fail silently — cache write failure must not break the response
    }
  }

  return res;
});
