/**
 * Integration tests for GET /api/tree/:slug (read-only, no auth).
 *
 * Uses an in-memory SQLite D1 shim (better-sqlite3). Hono app is driven
 * via app.fetch() — no real HTTP server needed.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@db/schema';
import { seedDemo } from '@worker/lib/seed';
import { treeRouter } from '@worker/routes/tree';
import { dbMiddleware } from '@worker/middleware/db';
import type { HonoEnv } from '@worker/types';
import { R2BucketStub, KVNamespaceStub } from '../helpers/mock-env';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function makeApp(d1: SqliteD1Database) {
  const app = new Hono<HonoEnv>();
  app.use('*', dbMiddleware);
  app.route('/api/tree', treeRouter);
  return app;
}

function makeEnv(d1: SqliteD1Database): Record<string, unknown> {
  const r2 = new R2BucketStub();
  const kv = new KVNamespaceStub();
  return {
    DB: d1 as unknown as D1Database,
    PHOTOS: r2 as unknown as R2Bucket,
    KV_RL: kv as unknown as KVNamespace,
    ASSETS: null,
    APP_URL: 'http://localhost:5173',
  };
}

async function req(
  app: ReturnType<typeof makeApp>,
  path: string,
  env: Record<string, unknown>,
) {
  const request = new Request(`http://localhost${path}`, { method: 'GET' });
  return app.fetch(request, env);
}

// ---------------------------------------------------------------------------
// Suite: public demo tree
// ---------------------------------------------------------------------------

describe('GET /api/tree/:slug — demo (public)', () => {
  let d1: SqliteD1Database;
  let env: Record<string, unknown>;
  let app: ReturnType<typeof makeApp>;

  beforeEach(async () => {
    d1 = createSqliteD1();
    env = makeEnv(d1);
    const db = drizzle(d1 as unknown as D1Database, { schema });
    await seedDemo(db);
    app = makeApp(d1);
  });

  test('GET /api/tree/wongsuriya returns 200 with 16 people', async () => {
    const res = await req(app, '/api/tree/wongsuriya', env);
    expect(res.status).toBe(200);
    const data = await res.json() as { people: unknown[] };
    expect(data.people).toHaveLength(16);
  });

  test('GET /api/tree/wongsuriya includes tree metadata', async () => {
    const res = await req(app, '/api/tree/wongsuriya', env);
    const data = await res.json() as {
      tree: { slug: string; name: string; isPublic: boolean };
    };
    expect(data.tree.slug).toBe('wongsuriya');
    expect(data.tree.isPublic).toBe(true);
  });

  test('GET /api/tree/wongsuriya includes >= 22 relations', async () => {
    const res = await req(app, '/api/tree/wongsuriya', env);
    const data = await res.json() as { relations: unknown[] };
    expect(data.relations.length).toBeGreaterThanOrEqual(22);
  });

  test('GET /api/tree/wongsuriya — relations contain no duplicate edges', async () => {
    const res = await req(app, '/api/tree/wongsuriya', env);
    const data = await res.json() as {
      relations: Array<{ fromId: string; toId: string; kind: 'parent' | 'spouse' }>;
    };
    const canonical = (r: { fromId: string; toId: string; kind: string }): string =>
      r.kind === 'spouse' && r.fromId > r.toId
        ? `spouse:${r.toId}:${r.fromId}`
        : `${r.kind}:${r.fromId}:${r.toId}`;
    const keys = data.relations.map(canonical);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  test('GET /api/tree/wongsuriya — spouse lists are symmetric and duplicate-free', async () => {
    const res = await req(app, '/api/tree/wongsuriya', env);
    const data = await res.json() as {
      people: Array<{ id: string; spouses: string[] }>;
    };
    const p7 = data.people.find((p) => p.id === 'p7');
    const p8 = data.people.find((p) => p.id === 'p8');
    expect(p7).toBeDefined();
    expect(p8).toBeDefined();
    expect(p7!.spouses).toContain('p8');
    expect(p8!.spouses).toContain('p7');
    for (const person of data.people) {
      const unique = new Set(person.spouses);
      expect(unique.size).toBe(person.spouses.length);
    }
  });

  test('GET /api/tree/wongsuriya includes 4 lineages', async () => {
    const res = await req(app, '/api/tree/wongsuriya', env);
    const data = await res.json() as { lineages: Record<string, unknown> };
    expect(Object.keys(data.lineages)).toHaveLength(4);
  });

  test('GET /api/tree/wongsuriya includes stories keyed by person id', async () => {
    const res = await req(app, '/api/tree/wongsuriya', env);
    const data = await res.json() as { stories: Record<string, unknown[]> };
    expect(Object.keys(data.stories).length).toBeGreaterThanOrEqual(4);
  });

  test('GET /api/tree/wongsuriya includes memos keyed by person id', async () => {
    const res = await req(app, '/api/tree/wongsuriya', env);
    const data = await res.json() as { memos: Record<string, unknown[]> };
    expect(Object.keys(data.memos).length).toBeGreaterThanOrEqual(3);
  });

  test('GET /api/tree/nonexistent returns 404', async () => {
    const res = await req(app, '/api/tree/nonexistent', env);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Suite: N-R3-5 — ownerId redaction for anonymous public reads
// ---------------------------------------------------------------------------

describe('N-R3-5 — ownerId redaction on public GET', () => {
  let d1: SqliteD1Database;
  let env: Record<string, unknown>;

  beforeEach(() => {
    d1 = createSqliteD1();
    env = makeEnv(d1);
    const sq = d1._sqlite;
    sq.prepare(
      "INSERT INTO users (id, email, display_name, created_at) VALUES ('owner-visible', 'owner@test.com', 'Owner', unixepoch())"
    ).run();
    sq.prepare(
      "INSERT INTO trees (id, slug, name, name_en, owner_id, is_public, visibility, created_at) VALUES ('pub-tree-1', 'pub-tree', 'Public Tree', NULL, 'owner-visible', 1, 'public', unixepoch())"
    ).run();
  });

  test('anonymous GET of public tree → ownerId === null in body', async () => {
    const app = makeApp(d1);
    const res = await req(app, '/api/tree/pub-tree', env);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tree: { ownerId: string | null } };
    expect(data.tree.ownerId).toBeNull();
  });

  test('authed GET of own public tree → ownerId preserved', async () => {
    // Wire a custom app with a fake authed user set on c.var.user.
    const app = new Hono<HonoEnv>();
    app.use('*', dbMiddleware);
    app.use('*', async (c, next) => {
      c.set('user', {
        id: 'owner-visible',
        email: 'owner@test.com',
        email_verified_at: 1,
      });
      return next();
    });
    app.route('/api/tree', treeRouter);

    const request = new Request('http://localhost/api/tree/pub-tree', {
      method: 'GET',
      headers: { Cookie: '__Host-session=fake-session-for-auth-branch' },
    });
    const res = await app.fetch(request, env);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tree: { ownerId: string | null } };
    expect(data.tree.ownerId).toBe('owner-visible');
  });
});

// ---------------------------------------------------------------------------
// Suite: private tree → 404 (is_public gate, no auth)
// ---------------------------------------------------------------------------

describe('GET /api/tree/:slug — private tree returns 404', () => {
  let d1: SqliteD1Database;
  let env: Record<string, unknown>;
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    d1 = createSqliteD1();
    env = makeEnv(d1);

    const sq = d1._sqlite;
    sq.prepare(
      "INSERT INTO users (id, email, display_name, created_at) VALUES ('owner1', 'owner@test.com', 'Owner', unixepoch())"
    ).run();
    sq.prepare(
      "INSERT INTO trees (id, slug, name, name_en, owner_id, is_public, visibility, created_at) VALUES ('priv-tree-1', 'priv-tree', 'Private Tree', NULL, 'owner1', 0, 'private', unixepoch())"
    ).run();
    sq.prepare(
      "INSERT INTO tree_members VALUES ('mb1', 'priv-tree-1', 'owner1', 'owner', unixepoch())"
    ).run();

    app = makeApp(d1);
  });

  test('GET /api/tree/priv-tree → 404 (private tree hidden without auth)', async () => {
    const res = await req(app, '/api/tree/priv-tree', env);
    expect(res.status).toBe(404);
  });
});
