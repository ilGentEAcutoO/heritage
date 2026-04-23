/**
 * Integration tests for trees list routes.
 *
 * Tests GET /api/trees (list owned + accepted-share trees)
 * and POST /api/trees (create new tree).
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import * as schema from '../../src/db/schema';
import { treesRouter } from '../../src/worker/routes/trees';
import type { HonoEnv } from '../../src/worker/types';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function setup(asUser: { id: string; email: string } | null = null) {
  const d1 = createSqliteD1();
  const db = drizzle(d1 as unknown as D1Database, { schema });
  const app = new Hono<HonoEnv>();
  app.use(async (c, next) => {
    c.set('db', db);
    return next();
  });
  app.use(async (c, next) => {
    c.set('user', asUser ? { ...asUser, email_verified_at: 1 } : null);
    return next();
  });
  app.route('/api/trees', treesRouter);
  return { app, db };
}

// ---------------------------------------------------------------------------
// Helper
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
// Suite: GET /api/trees
// ---------------------------------------------------------------------------

describe('GET /api/trees', () => {
  test('anonymous → 401', async () => {
    const { app } = await setup(null);
    const res = await makeReq(app, 'GET', '/api/trees');
    expect(res.status).toBe(401);
  });

  test('logged-in user with 2 owned trees → 200, length 2, roles all owner', async () => {
    const { app, db } = await setup({ id: 'alice1', email: 'alice@example.com' });
    await db.insert(schema.users).values({
      id: 'alice1',
      email: 'alice@example.com',
      email_verified_at: 1,
    });
    await db.insert(schema.trees).values([
      { id: 'tree1', slug: 'tree-one', name: 'Tree One', owner_id: 'alice1', visibility: 'private' },
      { id: 'tree2', slug: 'tree-two', name: 'Tree Two', owner_id: 'alice1', visibility: 'public' },
    ]);

    const res = await makeReq(app, 'GET', '/api/trees');
    expect(res.status).toBe(200);
    const body = await res.json() as { trees: Array<Record<string, unknown>> };
    expect(body.trees).toHaveLength(2);
    for (const t of body.trees) {
      expect(t.role).toBe('owner');
    }
  });

  test('logged-in user with 1 owned + 1 accepted share → length 2, correct roles', async () => {
    const { app, db } = await setup({ id: 'alice1', email: 'alice@example.com' });
    await db.insert(schema.users).values([
      { id: 'alice1', email: 'alice@example.com', email_verified_at: 1 },
      { id: 'bob1', email: 'bob@example.com', email_verified_at: 1 },
    ]);
    await db.insert(schema.trees).values([
      { id: 'tree1', slug: 'alice-tree', name: 'Alice Tree', owner_id: 'alice1', visibility: 'private' },
      { id: 'tree2', slug: 'bob-tree', name: 'Bob Tree', owner_id: 'bob1', visibility: 'shared' },
    ]);
    // Give alice an accepted share on tree2
    await db.insert(schema.tree_shares).values({
      id: 'share1',
      tree_id: 'tree2',
      email: 'alice@example.com',
      user_id: 'alice1',
      role: 'viewer',
      status: 'accepted',
      invited_by: 'bob1',
      accepted_at: Math.floor(Date.now() / 1000),
    });

    const res = await makeReq(app, 'GET', '/api/trees');
    expect(res.status).toBe(200);
    const body = await res.json() as { trees: Array<Record<string, unknown>> };
    expect(body.trees).toHaveLength(2);
    const aliceTree = body.trees.find((t) => t.id === 'tree1');
    const bobTree = body.trees.find((t) => t.id === 'tree2');
    expect(aliceTree!.role).toBe('owner');
    expect(bobTree!.role).toBe('viewer');
  });

  test('pending share does NOT appear', async () => {
    const { app, db } = await setup({ id: 'alice1', email: 'alice@example.com' });
    await db.insert(schema.users).values([
      { id: 'alice1', email: 'alice@example.com', email_verified_at: 1 },
      { id: 'bob1', email: 'bob@example.com', email_verified_at: 1 },
    ]);
    await db.insert(schema.trees).values({
      id: 'tree2', slug: 'bob-tree', name: 'Bob Tree', owner_id: 'bob1', visibility: 'shared',
    });
    // Pending share
    await db.insert(schema.tree_shares).values({
      id: 'share1',
      tree_id: 'tree2',
      email: 'alice@example.com',
      user_id: 'alice1',
      role: 'viewer',
      status: 'pending',
      invited_by: 'bob1',
    });

    const res = await makeReq(app, 'GET', '/api/trees');
    expect(res.status).toBe(200);
    const body = await res.json() as { trees: Array<Record<string, unknown>> };
    expect(body.trees).toHaveLength(0);
  });

  test('revoked share does NOT appear', async () => {
    const { app, db } = await setup({ id: 'alice1', email: 'alice@example.com' });
    await db.insert(schema.users).values([
      { id: 'alice1', email: 'alice@example.com', email_verified_at: 1 },
      { id: 'bob1', email: 'bob@example.com', email_verified_at: 1 },
    ]);
    await db.insert(schema.trees).values({
      id: 'tree2', slug: 'bob-tree', name: 'Bob Tree', owner_id: 'bob1', visibility: 'shared',
    });
    // Revoked share
    await db.insert(schema.tree_shares).values({
      id: 'share1',
      tree_id: 'tree2',
      email: 'alice@example.com',
      user_id: 'alice1',
      role: 'editor',
      status: 'revoked',
      invited_by: 'bob1',
    });

    const res = await makeReq(app, 'GET', '/api/trees');
    expect(res.status).toBe(200);
    const body = await res.json() as { trees: Array<Record<string, unknown>> };
    expect(body.trees).toHaveLength(0);
  });

  test('dedup: user is both owner and invited → only one entry, role=owner', async () => {
    const { app, db } = await setup({ id: 'alice1', email: 'alice@example.com' });
    await db.insert(schema.users).values([
      { id: 'alice1', email: 'alice@example.com', email_verified_at: 1 },
      { id: 'bob1', email: 'bob@example.com', email_verified_at: 1 },
    ]);
    await db.insert(schema.trees).values({
      id: 'tree1', slug: 'alice-tree', name: 'Alice Tree', owner_id: 'alice1', visibility: 'private',
    });
    // Also has an accepted share on own tree (weird but possible)
    await db.insert(schema.tree_shares).values({
      id: 'share1',
      tree_id: 'tree1',
      email: 'alice@example.com',
      user_id: 'alice1',
      role: 'viewer',
      status: 'accepted',
      invited_by: 'bob1',
    });

    const res = await makeReq(app, 'GET', '/api/trees');
    expect(res.status).toBe(200);
    const body = await res.json() as { trees: Array<Record<string, unknown>> };
    expect(body.trees).toHaveLength(1);
    expect(body.trees[0].role).toBe('owner');
  });
});

// ---------------------------------------------------------------------------
// Suite: POST /api/trees
// ---------------------------------------------------------------------------

describe('POST /api/trees', () => {
  test('creates tree → 201 with tree summary, role=owner', async () => {
    const { app, db } = await setup({ id: 'alice1', email: 'alice@example.com' });
    await db.insert(schema.users).values({
      id: 'alice1',
      email: 'alice@example.com',
      email_verified_at: 1,
    });

    const res = await makeReq(app, 'POST', '/api/trees', {
      name: 'My Family',
      slug: 'my-family',
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { tree: Record<string, unknown> };
    expect(body.tree.slug).toBe('my-family');
    expect(body.tree.name).toBe('My Family');
    expect(body.tree.owner_id).toBe('alice1');
    expect(body.tree.role).toBe('owner');
  });

  test('second POST with same slug → 409 slug_taken', async () => {
    const { app, db } = await setup({ id: 'alice1', email: 'alice@example.com' });
    await db.insert(schema.users).values({
      id: 'alice1',
      email: 'alice@example.com',
      email_verified_at: 1,
    });

    await makeReq(app, 'POST', '/api/trees', { name: 'My Family', slug: 'my-family' });
    const res2 = await makeReq(app, 'POST', '/api/trees', { name: 'Other Family', slug: 'my-family' });
    expect(res2.status).toBe(409);
    const body = await res2.json() as { error: string };
    expect(body.error).toBe('slug_taken');
  });

  test('anonymous POST → 401', async () => {
    const { app } = await setup(null);
    const res = await makeReq(app, 'POST', '/api/trees', { name: 'My Family', slug: 'my-family' });
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // N-R3-6 — slug format validation
  // ---------------------------------------------------------------------------

  describe('N-R3-6 — slug validation', () => {
    async function setupAuthed() {
      const { app, db } = await setup({ id: 'alice1', email: 'alice@example.com' });
      await db.insert(schema.users).values({
        id: 'alice1',
        email: 'alice@example.com',
        email_verified_at: 1,
      });
      return { app, db };
    }

    test('slug with ".." → 422', async () => {
      const { app } = await setupAuthed();
      const res = await makeReq(app, 'POST', '/api/trees', {
        name: 'Bad',
        slug: 'evil..slug',
      });
      expect(res.status).toBe(422);
    });

    test('slug with spaces → 422', async () => {
      const { app } = await setupAuthed();
      const res = await makeReq(app, 'POST', '/api/trees', {
        name: 'Bad',
        slug: 'has spaces',
      });
      expect(res.status).toBe(422);
    });

    test('slug starting with hyphen → 422', async () => {
      const { app } = await setupAuthed();
      const res = await makeReq(app, 'POST', '/api/trees', {
        name: 'Bad',
        slug: '-leading-hyphen',
      });
      expect(res.status).toBe(422);
    });

    test('slug with uppercase → normalised to lowercase, 201', async () => {
      const { app } = await setupAuthed();
      const res = await makeReq(app, 'POST', '/api/trees', {
        name: 'Mixed',
        slug: 'Mixed-Case-Slug',
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { tree: { slug: string } };
      expect(body.tree.slug).toBe('mixed-case-slug');
    });

    test('slug too long (>64 chars) → 422', async () => {
      const { app } = await setupAuthed();
      const longSlug = 'a' + 'b'.repeat(64);
      const res = await makeReq(app, 'POST', '/api/trees', {
        name: 'Long',
        slug: longSlug,
      });
      expect(res.status).toBe(422);
    });

    test('valid slug → 201', async () => {
      const { app } = await setupAuthed();
      const res = await makeReq(app, 'POST', '/api/trees', {
        name: 'Clean',
        slug: 'clean-slug-1',
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { tree: { slug: string } };
      expect(body.tree.slug).toBe('clean-slug-1');
    });

    test('empty name → 422', async () => {
      const { app } = await setupAuthed();
      const res = await makeReq(app, 'POST', '/api/trees', {
        name: '',
        slug: 'has-slug',
      });
      expect(res.status).toBe(422);
    });
  });
});
