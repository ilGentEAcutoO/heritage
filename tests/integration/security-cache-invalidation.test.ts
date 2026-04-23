/**
 * Security test — edge cache invalidation on visibility changes.
 *
 * Flow:
 *   1. Tree is 'public' → anonymous request caches it.
 *   2. Owner flips visibility to 'private' via PATCH /:slug/visibility.
 *   3. Anonymous request afterwards: the edge cache MUST have been purged,
 *      and the second read MUST recompute and return 404 (private tree).
 *
 * N-R3-3 remediation (2026-04-23): `purgeTreeCache` in `src/worker/lib/cache-purge.ts`
 * is invoked by shares.ts on PATCH visibility + POST/DELETE shares. These tests
 * assert the purge happens and the follow-up anon read returns 404.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import * as schema from '../../src/db/schema';
import { treeRouter } from '../../src/worker/routes/tree';
import { sharesRouter } from '../../src/worker/routes/shares';
import { dbMiddleware } from '../../src/worker/middleware/db';
import type { HonoEnv } from '../../src/worker/types';
import { R2BucketStub, KVNamespaceStub } from '../helpers/mock-env';

// ---------------------------------------------------------------------------
// caches.default mock
// ---------------------------------------------------------------------------

class CacheStoreMock {
  private store = new Map<string, { status: number; headers: [string, string][]; body: Uint8Array }>();
  deleteCallCount = 0;

  async match(req: Request): Promise<Response | undefined> {
    const entry = this.store.get(req.url);
    if (!entry) return undefined;
    return new Response(entry.body as unknown as BodyInit, {
      status: entry.status,
      headers: new Headers(entry.headers),
    });
  }

  async put(req: Request, res: Response): Promise<void> {
    const body = new Uint8Array(await res.arrayBuffer());
    const headers: [string, string][] = [];
    res.headers.forEach((v, k) => headers.push([k, v]));
    this.store.set(req.url, { status: res.status, headers, body });
  }

  async delete(req: Request): Promise<boolean> {
    this.deleteCallCount += 1;
    return this.store.delete(req.url);
  }

  clear() {
    this.store.clear();
    this.deleteCallCount = 0;
  }
}

const cacheStore = new CacheStoreMock();
let originalCaches: typeof globalThis.caches | undefined;

function installCachesMock() {
  originalCaches = (globalThis as unknown as { caches?: typeof globalThis.caches }).caches;
  (globalThis as unknown as { caches: unknown }).caches = { default: cacheStore };
}
function removeCachesMock() {
  if (originalCaches !== undefined) {
    (globalThis as unknown as { caches: typeof globalThis.caches }).caches = originalCaches;
  } else {
    delete (globalThis as unknown as { caches?: unknown }).caches;
  }
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function makeApp(d1: SqliteD1Database, user: { id: string; email: string } | null) {
  const app = new Hono<HonoEnv>();
  app.use('*', dbMiddleware);
  app.use('*', async (c, next) => {
    c.set('user', user ? { ...user, email_verified_at: 1 } : null);
    return next();
  });
  // Order matches src/worker/index.ts
  app.route('/api/tree', sharesRouter);
  app.route('/api/tree', treeRouter);
  return app;
}

function env(d1: SqliteD1Database): Record<string, unknown> {
  return {
    DB: d1 as unknown as D1Database,
    PHOTOS: new R2BucketStub() as unknown as R2Bucket,
    KV_RL: new KVNamespaceStub() as unknown as KVNamespace,
    ASSETS: null,
    APP_URL: 'http://localhost:5173',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('N-R3-3 remediation — visibility PATCH purges the edge cache', () => {
  let d1: SqliteD1Database;

  beforeEach(() => {
    installCachesMock();
    cacheStore.clear();
    d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });
    db.insert(schema.users).values({ id: 'owner1', email: 'o@x.com', email_verified_at: 1 }).run();
    db.insert(schema.trees).values({
      id: 'tree-flip',
      slug: 'flip-tree',
      name: 'FlipTree',
      owner_id: 'owner1',
      visibility: 'public',
    }).run();
  });

  afterEach(() => {
    removeCachesMock();
  });

  test('anonymous sees public tree (cache MISS, then cached)', async () => {
    const anonApp = makeApp(d1, null);
    const res = await anonApp.fetch(
      new Request('http://localhost/api/tree/flip-tree', { method: 'GET' }),
      env(d1),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-cache')).toBe('MISS');
  });

  test('owner PATCHes visibility public → private → cache is purged + anon sees 404', async () => {
    // Populate cache via an anonymous read
    const anonApp = makeApp(d1, null);
    await anonApp.fetch(
      new Request('http://localhost/api/tree/flip-tree', { method: 'GET' }),
      env(d1),
    );

    // Sanity: cache was populated
    expect(cacheStore.deleteCallCount).toBe(0);
    const cachedBefore = await cacheStore.match(
      new Request('http://localhost/api/tree/flip-tree'),
    );
    expect(cachedBefore?.status).toBe(200);

    // Owner flips visibility to private
    const ownerApp = makeApp(d1, { id: 'owner1', email: 'o@x.com' });
    const patchRes = await ownerApp.fetch(
      new Request('http://localhost/api/tree/flip-tree/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'private' }),
      }),
      env(d1),
    );
    expect(patchRes.status).toBe(200);

    // N-R3-3: PATCH handler MUST purge the edge cache entry.
    expect(cacheStore.deleteCallCount).toBeGreaterThanOrEqual(1);
    const cachedAfter = await cacheStore.match(
      new Request('http://localhost/api/tree/flip-tree'),
    );
    expect(cachedAfter).toBeUndefined();

    // The follow-up anon read must now recompute and see 404 (private tree).
    const res2 = await anonApp.fetch(
      new Request('http://localhost/api/tree/flip-tree', { method: 'GET' }),
      env(d1),
    );
    expect(res2.status).toBe(404);
  });
});
