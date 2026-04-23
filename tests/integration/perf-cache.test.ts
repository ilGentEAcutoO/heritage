/**
 * Integration tests for Perf Fix 1 — edge cache on GET /api/tree/:slug.
 *
 * Verifies:
 *   1. Public tree, no __Host-session cookie → Cache-Control: public, s-maxage=60, ...
 *      AND X-Cache: MISS on first request (response computed + stored).
 *   2. Public tree, with __Host-session cookie → Cache-Control: private, no-store.
 *   3. Private tree → 404 (gate blocks before cache write).
 *   4. Cache hit: second request returns X-Cache: HIT (served from caches.default).
 *
 * caches.default is NOT available in the test environment (Vitest / better-sqlite3).
 * We inject a mock `caches` global that tracks put/match calls so we can assert
 * the caching behaviour without a real Workers runtime.
 *
 * The mock is attached to globalThis before the Hono app processes requests so
 * the route can call `caches.default.match(...)` and `caches.default.put(...)`.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@db/schema';
import { treeRouter } from '@worker/routes/tree';
import { dbMiddleware } from '@worker/middleware/db';
import type { HonoEnv } from '@worker/types';
import { R2BucketStub, KVNamespaceStub } from '../helpers/mock-env';

// ---------------------------------------------------------------------------
// caches.default mock
// ---------------------------------------------------------------------------

class CacheStoreMock {
  private store = new Map<string, { status: number; headers: [string, string][]; body: Uint8Array }>();

  async match(req: Request): Promise<Response | undefined> {
    const entry = this.store.get(req.url);
    if (!entry) return undefined;
    // Return a fresh Response from the buffered body each time.
    // DOM BodyInit doesn't accept Uint8Array in strict lib mode — cast required.
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

  clear() {
    this.store.clear();
  }
}

const cacheStore = new CacheStoreMock();

// We need to install before tests run and restore after.
let originalCaches: typeof globalThis.caches | undefined;

function installCachesMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalCaches = (globalThis as any).caches;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).caches = { default: cacheStore };
}

function removeCachesMock() {
  if (originalCaches !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).caches = originalCaches;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).caches;
  }
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

type TestUser = { id: string; email: string; email_verified_at: number | null } | null;

function makeApp(d1: SqliteD1Database, testUser: TestUser = null) {
  const app = new Hono<HonoEnv>();
  // Inject DB
  app.use('*', dbMiddleware);
  // Inject user (simulates sessionMiddleware from W1)
  app.use('*', async (c, next) => {
    c.set('user', testUser);
    return next();
  });
  app.route('/api/tree', treeRouter);
  return app;
}

function makeEnv(d1: SqliteD1Database): Record<string, unknown> {
  return {
    DB: d1 as unknown as D1Database,
    PHOTOS: new R2BucketStub() as unknown as R2Bucket,
    KV_RL: new KVNamespaceStub() as unknown as KVNamespace,
    ASSETS: null,
    APP_URL: 'http://localhost:5173',
  };
}

async function req(
  app: ReturnType<typeof makeApp>,
  path: string,
  env: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const request = new Request(`http://localhost${path}`, { method: 'GET', headers });
  return app.fetch(request, env);
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedPublicTree(d1: SqliteD1Database, slug = 'pub-cache-tree') {
  const sq = d1._sqlite;
  sq.prepare(
    "INSERT OR IGNORE INTO users (id, email, display_name, created_at) VALUES ('cache-owner', 'cache@test.com', 'Owner', unixepoch())"
  ).run();
  sq.prepare(
    `INSERT OR IGNORE INTO trees (id, slug, name, owner_id, visibility, created_at)
     VALUES ('tree-pub-cache', ?, 'Cache Tree', 'cache-owner', 'public', unixepoch())`
  ).run(slug);
}

function seedPrivateTree(d1: SqliteD1Database, slug = 'priv-cache-tree') {
  const sq = d1._sqlite;
  sq.prepare(
    "INSERT OR IGNORE INTO users (id, email, display_name, created_at) VALUES ('cache-owner', 'cache@test.com', 'Owner', unixepoch())"
  ).run();
  sq.prepare(
    `INSERT OR IGNORE INTO trees (id, slug, name, owner_id, visibility, created_at)
     VALUES ('tree-priv-cache', ?, 'Private Cache Tree', 'cache-owner', 'private', unixepoch())`
  ).run(slug);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Perf Fix 1 — edge cache on GET /api/tree/:slug', () => {
  let d1: SqliteD1Database;
  let env: Record<string, unknown>;

  beforeEach(() => {
    installCachesMock();
    cacheStore.clear();
    d1 = createSqliteD1();
    env = makeEnv(d1);
  });

  afterEach(() => {
    removeCachesMock();
  });

  // -------------------------------------------------------------------------
  // Test 1: public tree, no cookie → public Cache-Control + X-Cache: MISS
  // -------------------------------------------------------------------------

  test('public tree, no session cookie → Cache-Control public + X-Cache: MISS', async () => {
    seedPublicTree(d1);
    const app = makeApp(d1, null);

    const res = await req(app, '/api/tree/pub-cache-tree', env);
    expect(res.status).toBe(200);

    const cc = res.headers.get('cache-control');
    expect(cc).toContain('public');
    expect(cc).toContain('s-maxage=60');
    expect(cc).toContain('stale-while-revalidate=300');

    expect(res.headers.get('x-cache')).toBe('MISS');
    expect(res.headers.get('vary')).toContain('Cookie');
  });

  // -------------------------------------------------------------------------
  // Test 2: public tree, with __Host-session cookie → private, no-store
  // -------------------------------------------------------------------------

  test('public tree, with __Host-session cookie → Cache-Control: private, no-store', async () => {
    seedPublicTree(d1);
    const app = makeApp(d1, { id: 'user-1', email: 'u@t.com', email_verified_at: 1 });

    const res = await req(app, '/api/tree/pub-cache-tree', env, {
      Cookie: '__Host-session=abc123',
    });
    expect(res.status).toBe(200);

    const cc = res.headers.get('cache-control');
    expect(cc).toBe('private, no-store');
    // Must not expose via cache
    expect(res.headers.get('x-cache')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 3: private tree → 404 (no cache)
  // -------------------------------------------------------------------------

  test('private tree (anon) → 404, no cache headers', async () => {
    seedPrivateTree(d1);
    const app = makeApp(d1, null);

    const res = await req(app, '/api/tree/priv-cache-tree', env);
    expect(res.status).toBe(404);
    // No public cache-control should be set (header may be absent or set to non-public)
    const cc = res.headers.get('cache-control');
    if (cc !== null) {
      expect(cc).not.toContain('public');
    }
  });

  // -------------------------------------------------------------------------
  // Test 4: cache hit — second request must return X-Cache: HIT
  // -------------------------------------------------------------------------

  test('second request for public tree served from cache → X-Cache: HIT', async () => {
    seedPublicTree(d1, 'pub-hit-tree');
    const app = makeApp(d1, null);

    // First request — cache miss, writes to caches.default
    const first = await req(app, '/api/tree/pub-hit-tree', env);
    expect(first.status).toBe(200);
    expect(first.headers.get('x-cache')).toBe('MISS');

    // Second request — cache hit, returns stored response
    const second = await req(app, '/api/tree/pub-hit-tree', env);
    expect(second.status).toBe(200);
    expect(second.headers.get('x-cache')).toBe('HIT');
  });
});
