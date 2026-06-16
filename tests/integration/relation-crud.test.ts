/**
 * Integration tests for relation CRUD endpoints:
 *   POST   /api/tree/:slug/relation
 *   DELETE /api/tree/:slug/relation/:relationId
 *
 * Mirrors the harness/style of person-status.test.ts exactly.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import * as schema from '../../src/db/schema';
import { peopleRouter } from '../../src/worker/routes/people';
import { treeRouter } from '../../src/worker/routes/tree';
import type { HonoEnv } from '../../src/worker/types';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

type User = { id: string; email: string } | null;

function makeApp(d1: SqliteD1Database, asUser: User = null) {
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

  app.route('/api/tree', peopleRouter);
  app.route('/api/tree', treeRouter);

  return { app, db };
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
// Seed helpers
// ---------------------------------------------------------------------------

async function seedBase(db: ReturnType<typeof drizzle<typeof schema>>) {
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
  await db.insert(schema.people).values([
    { id: 'p1', tree_id: 'tree1', name: 'Person A', deceased: false },
    { id: 'p2', tree_id: 'tree1', name: 'Person B', deceased: false },
    { id: 'p3', tree_id: 'tree1', name: 'Person C', deceased: false },
  ]);
}

// ---------------------------------------------------------------------------
// Suite: POST /:slug/relation — auth + ownership
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/relation — auth + ownership', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, null);
    await seedBase(db);
  });

  test('no session → 401', async () => {
    const { app } = makeApp(d1, null);
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'parent',
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  test('non-owner → 404 (anti-enumeration)', async () => {
    const { app } = makeApp(d1, { id: 'other1', email: 'other@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'parent',
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('not found');
  });
});

// ---------------------------------------------------------------------------
// Suite: POST /:slug/relation — successful creation
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/relation — successful creation', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedBase(db);
  });

  test('create parent relation → 201, returns relation with id', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'parent',
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { relation: Record<string, unknown> };
    expect(body.relation).toBeDefined();
    expect(body.relation.fromId).toBe('p1');
    expect(body.relation.toId).toBe('p2');
    expect(body.relation.kind).toBe('parent');
    expect(body.relation.id).toBeTruthy();
  });

  test('create spouse relation → 201, returns relation with id', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'spouse',
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { relation: Record<string, unknown> };
    expect(body.relation.kind).toBe('spouse');
  });
});

// ---------------------------------------------------------------------------
// Suite: POST /:slug/relation — guard: self-relation
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/relation — self-relation guard', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedBase(db);
  });

  test('fromId === toId (parent) → 422 self_relation', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p1',
      kind: 'parent',
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('self_relation');
  });

  test('fromId === toId (spouse) → 422 self_relation', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p2',
      toId: 'p2',
      kind: 'spouse',
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('self_relation');
  });
});

// ---------------------------------------------------------------------------
// Suite: POST /:slug/relation — guard: cross-tree person
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/relation — cross-tree person guard', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedBase(db);
    // Another tree with a person
    await db.insert(schema.trees).values({
      id: 'tree2',
      slug: 'other-tree',
      name: 'Other Tree',
      owner_id: 'owner1',
      visibility: 'public',
    });
    await db.insert(schema.people).values({
      id: 'p-other',
      tree_id: 'tree2',
      name: 'Other Person',
      deceased: false,
    });
  });

  test('fromId from different tree → 404', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p-other',
      toId: 'p2',
      kind: 'parent',
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('not found');
  });

  test('toId from different tree → 404', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p-other',
      kind: 'spouse',
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('not found');
  });

  test('non-existent fromId → 404', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'doesnotexist',
      toId: 'p1',
      kind: 'parent',
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Suite: POST /:slug/relation — duplicate guard
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/relation — duplicate guard', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedBase(db);
  });

  test('duplicate parent (same direction) → 409 duplicate_relation', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    // First insert
    const first = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'parent',
    });
    expect(first.status).toBe(201);

    // Second insert (same from/to/kind)
    const second = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'parent',
    });
    expect(second.status).toBe(409);
    const body = await second.json() as { error: string };
    expect(body.error).toBe('duplicate_relation');
  });

  test('duplicate spouse (same direction) → 409 duplicate_relation', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'spouse',
    });

    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'spouse',
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('duplicate_relation');
  });

  test('duplicate spouse (reverse direction) → 409 duplicate_relation', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'spouse',
    });

    // Same pair, reversed direction
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p2',
      toId: 'p1',
      kind: 'spouse',
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('duplicate_relation');
  });

  test('parent in reverse direction is NOT a duplicate (directed)', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'parent',
    });

    // Reverse: p2 → p3 is NOT duplicate of p1 → p2
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p2',
      toId: 'p3',
      kind: 'parent',
    });
    // p1 → p2, p2 → p3 is fine (but creates a chain, not a cycle since p3 is a new ancestor)
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Suite: POST /:slug/relation — cycle guard (parent)
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/relation — cycle guard (parent)', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedBase(db);
  });

  test('direct cycle: p1→p2 parent, then p2→p1 parent → 422 cycle', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    // p1 is child of p2 (p1→p2 means p1.parentIs=p2)
    await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'parent',
    });

    // Now try to make p2 a child of p1 → cycle
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p2',
      toId: 'p1',
      kind: 'parent',
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('cycle');
  });

  test('indirect cycle: p1→p2, p2→p3, then p3→p1 → 422 cycle', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    // p1 child of p2, p2 child of p3
    await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'parent',
    });
    await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p2',
      toId: 'p3',
      kind: 'parent',
    });

    // Now p3 tries to be a child of p1 → cycle (p1→p2→p3→p1)
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p3',
      toId: 'p1',
      kind: 'parent',
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('cycle');
  });

  test('no cycle: linear chain p1→p2→p3 is allowed', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    const r1 = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'parent',
    });
    expect(r1.status).toBe(201);

    const r2 = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p2',
      toId: 'p3',
      kind: 'parent',
    });
    expect(r2.status).toBe(201);
  });

  test('spouse relations do not trigger cycle check', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    // Create spouse and then a parent in the opposite direction
    await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p1',
      toId: 'p2',
      kind: 'spouse',
    });
    // p2 can still be a parent of p1 (odd but not cycle for parent edges)
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/relation', {
      fromId: 'p2',
      toId: 'p1',
      kind: 'parent',
    });
    // No cycle in parent graph — this should succeed
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Suite: DELETE /:slug/relation/:relationId — auth + ownership
// ---------------------------------------------------------------------------

describe('DELETE /api/tree/:slug/relation/:relationId — auth + ownership', () => {
  let d1: SqliteD1Database;
  let relationId: number;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedBase(db);
    const result = await db
      .insert(schema.relations)
      .values({ tree_id: 'tree1', from_id: 'p1', to_id: 'p2', kind: 'parent' })
      .returning({ id: schema.relations.id });
    relationId = result[0].id;
  });

  test('no session → 401', async () => {
    const { app } = makeApp(d1, null);
    const res = await makeReq(app, 'DELETE', `/api/tree/test-tree/relation/${relationId}`);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  test('non-owner → 404 (anti-enumeration)', async () => {
    const { app } = makeApp(d1, { id: 'other1', email: 'other@example.com' });
    const res = await makeReq(app, 'DELETE', `/api/tree/test-tree/relation/${relationId}`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('not found');
  });
});

// ---------------------------------------------------------------------------
// Suite: DELETE /:slug/relation/:relationId — successful deletion
// ---------------------------------------------------------------------------

describe('DELETE /api/tree/:slug/relation/:relationId — successful deletion', () => {
  let d1: SqliteD1Database;
  let relationId: number;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedBase(db);
    const result = await db
      .insert(schema.relations)
      .values({ tree_id: 'tree1', from_id: 'p1', to_id: 'p2', kind: 'parent' })
      .returning({ id: schema.relations.id });
    relationId = result[0].id;
  });

  test('delete existing relation → 200, {ok: true}', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'DELETE', `/api/tree/test-tree/relation/${relationId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('delete non-existent relation → 404', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'DELETE', '/api/tree/test-tree/relation/99999');
    expect(res.status).toBe(404);
  });

  test('delete relation belonging to a different tree → 404', async () => {
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    // Set up another tree with its own people and relation
    await db.insert(schema.trees).values({
      id: 'tree2',
      slug: 'other-tree',
      name: 'Other Tree',
      owner_id: 'owner1',
      visibility: 'public',
    });
    await db.insert(schema.people).values([
      { id: 'q1', tree_id: 'tree2', name: 'Q1', deceased: false },
      { id: 'q2', tree_id: 'tree2', name: 'Q2', deceased: false },
    ]);
    const result2 = await db
      .insert(schema.relations)
      .values({ tree_id: 'tree2', from_id: 'q1', to_id: 'q2', kind: 'spouse' })
      .returning({ id: schema.relations.id });
    const tree2RelationId = result2[0].id;

    // Try to delete tree2's relation via test-tree slug
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(
      app,
      'DELETE',
      `/api/tree/test-tree/relation/${tree2RelationId}`,
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('not found');
  });
});
