/**
 * cache-purge.ts — best-effort edge cache invalidation.
 *
 * The tree router (`src/worker/routes/tree.ts`) writes public tree responses to
 * `caches.default` using a URL-only key (`new Request(c.req.url)`). Any route
 * that mutates a tree's visibility / share-state must purge that cache entry so
 * anonymous viewers don't keep seeing the stale (formerly-public) body. The
 * cache is a CDN, so purge failures are non-fatal — we swallow all errors.
 */

/**
 * Purge the cached `/api/tree/:slug` GET response for the given slug.
 *
 * Reconstructs the exact same URL shape used by the cache write
 * (pathname=/api/tree/{slug}, empty search) so the key matches. Safe to call
 * from any handler — no-op if the runtime does not expose `caches.default`
 * (e.g. local `wrangler dev` in some modes, unit tests without the shim).
 *
 * @param requestUrl — any absolute URL from the current request (c.req.url). We
 * reuse its origin so the cache key matches the one written by the GET handler.
 * @param slug — the tree slug whose cache entry should be invalidated.
 */
export async function purgeTreeCache(requestUrl: string, slug: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cfCaches = caches as unknown as { default: Cache };
  try {
    const url = new URL(requestUrl);
    url.pathname = `/api/tree/${slug}`;
    url.search = '';
    await cfCaches.default.delete(new Request(url.toString()));
  } catch {
    // best-effort — cache purge must never break a successful mutation
  }
}
