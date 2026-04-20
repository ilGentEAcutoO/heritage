/**
 * Integration tests for /api/tree/* routes.
 *
 * Uses an in-memory SQLite D1 shim (better-sqlite3) so no external services needed.
 * The Hono app is called via app.request() which avoids needing a real HTTP server.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createSqliteD1, SqliteD1Database } from '../helpers/sqlite-d1';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@db/schema';
import { seedDemo } from '@worker/lib/seed';
import { treeRouter } from '@worker/routes/tree';
import { dbMiddleware, sessionMiddleware } from '@worker/middleware/session';
import type { HonoEnv } from '@worker/types';

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(d1: SqliteD1Database, userOverride?: { id: string; email: string; displayName: string | null }) {
  const app = new Hono<HonoEnv>();

  // Attach db
  app.use('*', dbMiddleware);

  // Session middleware — in tests we inject user via a custom middleware
  app.use('*', sessionMiddleware);

  // Optional: inject a test user to bypass real cookie auth
  if (userOverride) {
    app.use('*', async (c, next) => {
      c.set('user', userOverride);
      return next();
    });
  }

  // Mount tree routes
  app.route('/api/tree', treeRouter);

  return app;
}

function makeEnv(d1: SqliteD1Database): Record<string, unknown> {
  return {
    DB: d1 as unknown as D1Database,
    PHOTOS: null,
    KV_RL: null,
    EMAIL: null,
    ASSETS: null,
    APP_URL: 'http://localhost:5173',
    EMAIL_FROM: 'noreply@test.com',
    EMAIL_DEV_STUB: '1',
    SESSION_SECRET: 'test-secret-32-bytes-long-padded!!',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function req(
  app: ReturnType<typeof makeApp>,
  method: string,
  path: string,
  env: Record<string, unknown>,
  body?: unknown,
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const request = new Request(`http://localhost${path}`, init);
  return app.fetch(request, env);
}

// ---------------------------------------------------------------------------
// Suite: anonymous demo tree access
// ---------------------------------------------------------------------------

describe('tree API — demo tree (anonymous)', () => {
  let d1: SqliteD1Database;
  let env: Record<string, unknown>;
  let app: ReturnType<typeof makeApp>;

  beforeEach(async () => {
    d1 = createSqliteD1();
    env = makeEnv(d1);

    // Seed demo data
    const db = drizzle(d1 as unknown as D1Database, { schema });
    await seedDemo(db);

    app = makeApp(d1);
  });

  test('GET /api/tree/wongsuriya returns 200 with 16 people', async () => {
    const res = await req(app, 'GET', '/api/tree/wongsuriya', env);
    expect(res.status).toBe(200);
    const data = await res.json() as { people: unknown[] };
    expect(data.people).toHaveLength(16);
  });

  test('GET /api/tree/wongsuriya includes tree metadata', async () => {
    const res = await req(app, 'GET', '/api/tree/wongsuriya', env);
    const data = await res.json() as {
      tree: { slug: string; name: string; isPublic: boolean };
    };
    expect(data.tree.slug).toBe('wongsuriya');
    expect(data.tree.isPublic).toBe(true);
  });

  test('GET /api/tree/wongsuriya includes >= 22 relations', async () => {
    const res = await req(app, 'GET', '/api/tree/wongsuriya', env);
    const data = await res.json() as { relations: unknown[] };
    // seed has 24 relations total (counted from seed.ts)
    expect(data.relations.length).toBeGreaterThanOrEqual(22);
  });

  test('GET /api/tree/wongsuriya — relations contain no duplicate edges after canonicalisation', async () => {
    const res = await req(app, 'GET', '/api/tree/wongsuriya', env);
    const data = await res.json() as {
      relations: Array<{ fromId: string; toId: string; kind: 'parent' | 'spouse' }>;
    };

    // Build a canonical key for each edge (spouse is undirected — smaller id first)
    const canonical = (r: { fromId: string; toId: string; kind: string }): string =>
      r.kind === 'spouse' && r.fromId > r.toId
        ? `spouse:${r.toId}:${r.fromId}`
        : `${r.kind}:${r.fromId}:${r.toId}`;

    const keys = data.relations.map(canonical);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  test('GET /api/tree/wongsuriya — spouse lists are symmetric and duplicate-free', async () => {
    const res = await req(app, 'GET', '/api/tree/wongsuriya', env);
    const data = await res.json() as {
      people: Array<{ id: string; spouses: string[] }>;
    };

    // p7 (Arun) and p8 (Darin) are spouses.
    // The seed stores only `p8 → p7`, so without the fix p7.spouses would be [].
    const p7 = data.people.find((p) => p.id === 'p7');
    const p8 = data.people.find((p) => p.id === 'p8');
    expect(p7).toBeDefined();
    expect(p8).toBeDefined();
    expect(p7!.spouses).toContain('p8');
    expect(p8!.spouses).toContain('p7');

    // All spouse lists must be duplicate-free
    for (const person of data.people) {
      const unique = new Set(person.spouses);
      expect(unique.size).toBe(person.spouses.length);
    }
  });

  test('GET /api/tree/wongsuriya includes 4 lineages', async () => {
    const res = await req(app, 'GET', '/api/tree/wongsuriya', env);
    const data = await res.json() as { lineages: Record<string, unknown> };
    expect(Object.keys(data.lineages)).toHaveLength(4);
  });

  test('GET /api/tree/wongsuriya includes stories keyed by person id', async () => {
    const res = await req(app, 'GET', '/api/tree/wongsuriya', env);
    const data = await res.json() as { stories: Record<string, unknown[]> };
    // p1, p3, p7, p12 each have 2 stories = 4 people with stories
    expect(Object.keys(data.stories).length).toBeGreaterThanOrEqual(4);
  });

  test('GET /api/tree/wongsuriya includes memos keyed by person id', async () => {
    const res = await req(app, 'GET', '/api/tree/wongsuriya', env);
    const data = await res.json() as { memos: Record<string, unknown[]> };
    expect(Object.keys(data.memos).length).toBeGreaterThanOrEqual(3);
  });

  test('GET /api/tree/nonexistent returns 404', async () => {
    const res = await req(app, 'GET', '/api/tree/nonexistent', env);
    expect(res.status).toBe(404);
  });

  test('POST /api/tree/wongsuriya/people → 401 without session', async () => {
    const res = await req(app, 'POST', '/api/tree/wongsuriya/people', env, {
      name: 'Test Person',
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Suite: private tree access control
// ---------------------------------------------------------------------------

describe('tree API — private tree access control', () => {
  let d1: SqliteD1Database;
  let env: Record<string, unknown>;

  beforeEach(async () => {
    d1 = createSqliteD1();
    env = makeEnv(d1);

    // Create a private tree via direct DB insert
    const sqlite = d1._sqlite;
    sqlite.prepare(
      "INSERT INTO users VALUES ('owner1', 'owner@test.com', 'Owner', unixepoch())"
    ).run();
    sqlite.prepare(
      "INSERT INTO trees VALUES ('private-tree-1', 'private-tree', 'My Private Tree', NULL, 'owner1', 0, unixepoch())"
    ).run();
    sqlite.prepare(
      "INSERT INTO tree_members VALUES ('mb1', 'private-tree-1', 'owner1', 'owner', unixepoch())"
    ).run();
  });

  test('GET /api/tree/private-tree as anonymous → 403', async () => {
    const anonApp = makeApp(d1); // no user
    const res = await req(anonApp, 'GET', '/api/tree/private-tree', env);
    expect(res.status).toBe(403);
  });

  test('GET /api/tree/private-tree as owner → 200', async () => {
    const ownerApp = makeApp(d1, { id: 'owner1', email: 'owner@test.com', displayName: 'Owner' });
    const res = await req(ownerApp, 'GET', '/api/tree/private-tree', env);
    expect(res.status).toBe(200);
  });

  test('GET /api/tree/private-tree as non-member → 403', async () => {
    const otherApp = makeApp(d1, { id: 'other1', email: 'other@test.com', displayName: null });
    const res = await req(otherApp, 'GET', '/api/tree/private-tree', env);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Suite: tree creation
// ---------------------------------------------------------------------------

describe('tree API — tree creation [auth]', () => {
  let d1: SqliteD1Database;
  let env: Record<string, unknown>;

  beforeEach(async () => {
    d1 = createSqliteD1();
    env = makeEnv(d1);

    // Insert test user
    d1._sqlite.prepare(
      "INSERT INTO users VALUES ('user1', 'user@test.com', 'Test User', unixepoch())"
    ).run();
  });

  test('POST /api/tree without auth → 401', async () => {
    const anonApp = makeApp(d1); // no user
    const res = await req(anonApp, 'POST', '/api/tree', env, {
      slug: 'my-tree',
      name: 'My Tree',
      is_public: false,
    });
    expect(res.status).toBe(401);
  });

  test('POST /api/tree with auth creates tree + owner membership', async () => {
    const authApp = makeApp(d1, { id: 'user1', email: 'user@test.com', displayName: 'Test User' });
    const res = await req(authApp, 'POST', '/api/tree', env, {
      slug: 'my-new-tree',
      name: 'My New Tree',
      is_public: false,
    });
    expect(res.status).toBe(201);
    // Drizzle D1 returns raw column names (snake_case)
    const data = await res.json() as { tree: { slug: string; owner_id: string } };
    expect(data.tree.slug).toBe('my-new-tree');
    expect(data.tree.owner_id).toBe('user1');

    // Verify membership row exists
    const membership = d1._sqlite
      .prepare("SELECT * FROM tree_members WHERE user_id='user1' AND role='owner'")
      .get() as { role: string } | undefined;
    expect(membership).toBeDefined();
    expect(membership?.role).toBe('owner');
  });

  test('POST /api/tree with invalid body → 400', async () => {
    const authApp = makeApp(d1, { id: 'user1', email: 'user@test.com', displayName: null });
    const res = await req(authApp, 'POST', '/api/tree', env, {
      slug: 'Invalid Slug!!',  // not kebab-case
      name: 'My Tree',
      is_public: false,
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Suite: people CRUD
// ---------------------------------------------------------------------------

describe('tree API — people CRUD [auth, editor+]', () => {
  let d1: SqliteD1Database;
  let env: Record<string, unknown>;
  const TREE_ID = 'test-tree-1';

  beforeEach(async () => {
    d1 = createSqliteD1();
    env = makeEnv(d1);

    const sq = d1._sqlite;
    sq.prepare("INSERT INTO users VALUES ('owner1', 'owner@test.com', 'Owner', unixepoch())").run();
    sq.prepare("INSERT INTO users VALUES ('editor1', 'editor@test.com', 'Editor', unixepoch())").run();
    sq.prepare("INSERT INTO users VALUES ('viewer1', 'viewer@test.com', 'Viewer', unixepoch())").run();
    sq.prepare(
      `INSERT INTO trees VALUES ('${TREE_ID}', 'test-tree', 'Test Tree', NULL, 'owner1', 0, unixepoch())`
    ).run();
    sq.prepare(`INSERT INTO tree_members VALUES ('mb1', '${TREE_ID}', 'owner1', 'owner', unixepoch())`).run();
    sq.prepare(`INSERT INTO tree_members VALUES ('mb2', '${TREE_ID}', 'editor1', 'editor', unixepoch())`).run();
    sq.prepare(`INSERT INTO tree_members VALUES ('mb3', '${TREE_ID}', 'viewer1', 'viewer', unixepoch())`).run();

    // Seed one person for PATCH/DELETE tests
    sq.prepare(
      `INSERT INTO people VALUES ('per1', '${TREE_ID}', 'Original Name', NULL, NULL, NULL, NULL, 'm', NULL, 0, 0, NULL, NULL)`
    ).run();
  });

  test('POST /api/tree/:slug/people as non-member → 403', async () => {
    const otherApp = makeApp(d1, { id: 'other1', email: 'other@test.com', displayName: null });
    const res = await req(otherApp, 'POST', '/api/tree/test-tree/people', env, {
      name: 'New Person',
      gender: 'm',
    });
    expect(res.status).toBe(403);
  });

  test('POST /api/tree/:slug/people as viewer → 403', async () => {
    const viewerApp = makeApp(d1, { id: 'viewer1', email: 'viewer@test.com', displayName: null });
    const res = await req(viewerApp, 'POST', '/api/tree/test-tree/people', env, {
      name: 'New Person',
      gender: 'm',
    });
    expect(res.status).toBe(403);
  });

  test('POST /api/tree/:slug/people as editor → 201', async () => {
    const editorApp = makeApp(d1, { id: 'editor1', email: 'editor@test.com', displayName: null });
    const res = await req(editorApp, 'POST', '/api/tree/test-tree/people', env, {
      name: 'New Person',
      gender: 'f',
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { person: { name: string } };
    expect(data.person.name).toBe('New Person');
  });

  test('POST /api/tree/:slug/people with invalid body → 400', async () => {
    const editorApp = makeApp(d1, { id: 'editor1', email: 'editor@test.com', displayName: null });
    const res = await req(editorApp, 'POST', '/api/tree/test-tree/people', env, {
      // missing required 'name'
      gender: 'x', // also invalid
    });
    expect(res.status).toBe(400);
  });

  test('PATCH /api/tree/:slug/people/:id without editor role → 403', async () => {
    const viewerApp = makeApp(d1, { id: 'viewer1', email: 'viewer@test.com', displayName: null });
    const res = await req(viewerApp, 'PATCH', '/api/tree/test-tree/people/per1', env, {
      name: 'Updated Name',
    });
    expect(res.status).toBe(403);
  });

  test('PATCH /api/tree/:slug/people/:id as editor → 200 + row updated', async () => {
    const editorApp = makeApp(d1, { id: 'editor1', email: 'editor@test.com', displayName: null });
    const res = await req(editorApp, 'PATCH', '/api/tree/test-tree/people/per1', env, {
      name: 'Updated Name',
      nick: 'Nicky',
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { person: { name: string; nick: string } };
    expect(data.person.name).toBe('Updated Name');
    expect(data.person.nick).toBe('Nicky');

    // Verify DB was updated
    const row = d1._sqlite
      .prepare("SELECT name, nick FROM people WHERE id='per1'")
      .get() as { name: string; nick: string };
    expect(row.name).toBe('Updated Name');
    expect(row.nick).toBe('Nicky');
  });

  test('DELETE /api/tree/:slug/people/:id as editor → 204', async () => {
    const editorApp = makeApp(d1, { id: 'editor1', email: 'editor@test.com', displayName: null });
    const res = await req(editorApp, 'DELETE', '/api/tree/test-tree/people/per1', env);
    expect(res.status).toBe(204);

    // Verify gone
    const row = d1._sqlite
      .prepare("SELECT id FROM people WHERE id='per1'")
      .get();
    expect(row).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite: position overrides (PUT)
// ---------------------------------------------------------------------------

describe('tree API — position overrides', () => {
  let d1: SqliteD1Database;
  let env: Record<string, unknown>;
  const TREE_ID = 'ov-tree-1';

  beforeEach(async () => {
    d1 = createSqliteD1();
    env = makeEnv(d1);

    const sq = d1._sqlite;
    sq.prepare("INSERT INTO users VALUES ('user1', 'user@test.com', 'User One', unixepoch())").run();
    sq.prepare(
      `INSERT INTO trees VALUES ('${TREE_ID}', 'ov-tree', 'Override Tree', NULL, 'user1', 1, unixepoch())`
    ).run();
    sq.prepare(`INSERT INTO tree_members VALUES ('mb1', '${TREE_ID}', 'user1', 'owner', unixepoch())`).run();

    // Insert 5 people
    for (let i = 1; i <= 5; i++) {
      sq.prepare(
        `INSERT INTO people VALUES ('pov${i}', '${TREE_ID}', 'Person ${i}', NULL, NULL, NULL, NULL, 'm', NULL, 0, 0, NULL, NULL)`
      ).run();
    }
  });

  test('PUT /api/tree/:slug/overrides without auth → 401', async () => {
    const anonApp = makeApp(d1);
    const res = await req(anonApp, 'PUT', '/api/tree/ov-tree/overrides', env, {
      overrides: [{ personId: 'pov1', dx: 10, dy: 20 }],
    });
    expect(res.status).toBe(401);
  });

  test('PUT /api/tree/:slug/overrides with 5 overrides → 204', async () => {
    const authApp = makeApp(d1, { id: 'user1', email: 'user@test.com', displayName: null });
    const overrides = Array.from({ length: 5 }, (_, i) => ({
      personId: `pov${i + 1}`,
      dx: (i + 1) * 10,
      dy: (i + 1) * 20,
    }));

    const res = await req(authApp, 'PUT', '/api/tree/ov-tree/overrides', env, { overrides });
    expect(res.status).toBe(204);

    // Verify rows exist
    const count = (d1._sqlite.prepare(
      "SELECT COUNT(*) as c FROM position_overrides WHERE user_id='user1'"
    ).get() as { c: number }).c;
    expect(count).toBe(5);
  });

  test('Second PUT updates rather than inserts (upsert)', async () => {
    const authApp = makeApp(d1, { id: 'user1', email: 'user@test.com', displayName: null });

    // First PUT
    await req(authApp, 'PUT', '/api/tree/ov-tree/overrides', env, {
      overrides: [{ personId: 'pov1', dx: 10, dy: 20 }],
    });

    // Second PUT with different values
    await req(authApp, 'PUT', '/api/tree/ov-tree/overrides', env, {
      overrides: [{ personId: 'pov1', dx: 99, dy: 88 }],
    });

    // Should have exactly 1 row, not 2
    const count = (d1._sqlite.prepare(
      "SELECT COUNT(*) as c FROM position_overrides WHERE user_id='user1' AND person_id='pov1'"
    ).get() as { c: number }).c;
    expect(count).toBe(1);

    const row = d1._sqlite.prepare(
      "SELECT dx, dy FROM position_overrides WHERE user_id='user1' AND person_id='pov1'"
    ).get() as { dx: number; dy: number };
    expect(row.dx).toBe(99);
    expect(row.dy).toBe(88);
  });
});

// ---------------------------------------------------------------------------
// Suite: Zod validation
// ---------------------------------------------------------------------------

describe('tree API — Zod validation', () => {
  let d1: SqliteD1Database;
  let env: Record<string, unknown>;
  const TREE_ID = 'val-tree-1';

  beforeEach(async () => {
    d1 = createSqliteD1();
    env = makeEnv(d1);

    const sq = d1._sqlite;
    sq.prepare("INSERT INTO users VALUES ('u1', 'u@test.com', 'U', unixepoch())").run();
    sq.prepare(
      `INSERT INTO trees VALUES ('${TREE_ID}', 'val-tree', 'Val Tree', NULL, 'u1', 0, unixepoch())`
    ).run();
    sq.prepare(`INSERT INTO tree_members VALUES ('mb1', '${TREE_ID}', 'u1', 'editor', unixepoch())`).run();
  });

  test('POST /api/tree/:slug/people — born > current year → 400', async () => {
    const app = makeApp(d1, { id: 'u1', email: 'u@test.com', displayName: null });
    const res = await req(app, 'POST', '/api/tree/val-tree/people', env, {
      name: 'Future Person',
      born: 9999,
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/tree/:slug/people — invalid gender → 400', async () => {
    const app = makeApp(d1, { id: 'u1', email: 'u@test.com', displayName: null });
    const res = await req(app, 'POST', '/api/tree/val-tree/people', env, {
      name: 'Person',
      gender: 'other', // not in enum
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/tree/:slug/stories — body > 4KB → 400', async () => {
    // Insert a person to reference
    d1._sqlite.prepare(
      `INSERT INTO people VALUES ('pv1', '${TREE_ID}', 'P', NULL, NULL, NULL, NULL, 'm', NULL, 0, 0, NULL, NULL)`
    ).run();

    const app = makeApp(d1, { id: 'u1', email: 'u@test.com', displayName: null });
    const res = await req(app, 'POST', '/api/tree/val-tree/stories', env, {
      personId: 'pv1',
      body: 'x'.repeat(4097),
    });
    expect(res.status).toBe(400);
  });
});
