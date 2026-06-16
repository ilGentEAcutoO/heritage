/**
 * Integration tests for PATCH /api/tree/:slug/theme (ws11 per-tree theming).
 *
 * Verifies:
 *   - 200 owner sets a valid palette key
 *   - 200 owner clears theme (null)
 *   - 401 unauthenticated request
 *   - 404 non-owner (anti-enumeration)
 *   - 422 invalid palette key
 *   - GET /api/tree/:slug reflects updated theme in tree metadata
 */

import { describe, test, expect } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import * as schema from '@db/schema';
import { sharesRouter } from '@worker/routes/shares';
import { treeRouter } from '@worker/routes/tree';
import { dbMiddleware } from '@worker/middleware/db';
import type { HonoEnv } from '@worker/types';
import { R2BucketStub, KVNamespaceStub } from '../helpers/mock-env';

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------

async function setupShares(asUser: { id: string; email: string } | null = null) {
  const d1 = createSqliteD1();
  const db = drizzle(d1 as unknown as D1Database, { schema });
  const app = new Hono<HonoEnv>();
  app.use(async (c, next) => {
    c.set('db', db);
    return next();
  });
  app.use(async (c, next) => {
    c.set(
      'user',
      asUser ? { ...asUser, displayName: null, email_verified_at: 1 } : null,
    );
    return next();
  });
  app.route('/api/tree', sharesRouter);
  return { app, db, d1 };
}

function makeTreeApp(d1: SqliteD1Database) {
  const app = new Hono<HonoEnv>();
  app.use('*', dbMiddleware);
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

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedOwnerAndTree(db: ReturnType<typeof drizzle<typeof schema>>) {
  await db.insert(schema.users).values({
    id: 'owner1',
    email: 'owner@example.com',
    email_verified_at: 1,
  });
  await db.insert(schema.trees).values({
    id: 'tree1',
    slug: 'test-tree',
    name: 'Test Tree',
    owner_id: 'owner1',
    visibility: 'public',
  });
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

function makeReq(
  app: Hono<HonoEnv>,
  method: string,
  path: string,
  body?: unknown,
) {
  const opts: RequestInit = { method };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { 'Content-Type': 'application/json' };
  }
  return app.fetch(new Request(`http://localhost${path}`, opts));
}

// ---------------------------------------------------------------------------
// Suite: PATCH /:slug/theme
// ---------------------------------------------------------------------------

describe('PATCH /api/tree/:slug/theme', () => {
  test('owner sets valid theme key → 200 with theme in response', async () => {
    const { app, db } = await setupShares({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/theme', {
      theme: 'forest',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { theme: string };
    expect(body.theme).toBe('forest');
  });

  test('owner sets theme to null (clear) → 200 with theme: null', async () => {
    const { app, db } = await setupShares({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    // First set a theme
    await makeReq(app, 'PATCH', '/api/tree/test-tree/theme', { theme: 'ocean' });

    // Then clear it
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/theme', {
      theme: null,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { theme: null };
    expect(body.theme).toBeNull();
  });

  test('all valid palette keys accepted → 200', async () => {
    const validKeys = ['paper', 'forest', 'blueprint', 'rose', 'ocean'] as const;
    for (const key of validKeys) {
      const { app, db } = await setupShares({ id: 'owner1', email: 'owner@example.com' });
      await seedOwnerAndTree(db);

      const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/theme', {
        theme: key,
      });
      expect(res.status, `expected 200 for key "${key}"`).toBe(200);
      const body = await res.json() as { theme: string };
      expect(body.theme).toBe(key);
    }
  });

  test('no session → 401', async () => {
    const { app, db } = await setupShares(null);
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/theme', {
      theme: 'forest',
    });
    expect(res.status).toBe(401);
  });

  test('non-owner → 404 (anti-enumeration)', async () => {
    const { app, db } = await setupShares({
      id: 'other1',
      email: 'other@example.com',
    });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/theme', {
      theme: 'rose',
    });
    expect(res.status).toBe(404);
  });

  test('invalid theme key → 422', async () => {
    const { app, db } = await setupShares({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/theme', {
      theme: 'rainbow',
    });
    expect(res.status).toBe(422);
  });

  test('unknown slug for owner → 404', async () => {
    const { app, db } = await setupShares({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'PATCH', '/api/tree/no-such-slug/theme', {
      theme: 'forest',
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Suite: GET /api/tree/:slug reflects theme
// ---------------------------------------------------------------------------

describe('GET /api/tree/:slug — theme in tree metadata', () => {
  test('theme defaults to null on new tree', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });
    await seedOwnerAndTree(db);

    const treeApp = makeTreeApp(d1);
    const env = makeEnv(d1);

    const res = await treeApp.fetch(
      new Request('http://localhost/api/tree/test-tree'),
      env,
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { tree: { theme: unknown } };
    expect(data.tree.theme).toBeNull();
  });

  test('theme set by owner is visible in GET response for all viewers', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });
    await seedOwnerAndTree(db);

    // Owner sets theme via shares router
    const ownerApp = new Hono<HonoEnv>();
    ownerApp.use(async (c, next) => {
      c.set('db', db);
      return next();
    });
    ownerApp.use(async (c, next) => {
      c.set('user', { id: 'owner1', email: 'owner@example.com', displayName: null, email_verified_at: 1 });
      return next();
    });
    ownerApp.route('/api/tree', sharesRouter);

    const patchRes = await makeReq(ownerApp, 'PATCH', '/api/tree/test-tree/theme', {
      theme: 'blueprint',
    });
    expect(patchRes.status).toBe(200);

    // GET returns updated theme (no cache in test environment)
    const treeApp = makeTreeApp(d1);
    const env = makeEnv(d1);

    const getRes = await treeApp.fetch(
      new Request('http://localhost/api/tree/test-tree'),
      env,
    );
    expect(getRes.status).toBe(200);
    const data = await getRes.json() as { tree: { theme: string } };
    expect(data.tree.theme).toBe('blueprint');
  });
});
