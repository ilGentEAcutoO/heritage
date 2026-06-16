/**
 * Integration tests for PATCH /api/tree/:slug/person/:personId
 *
 * Covers owner-only access, consistency rules, and cache-purge side effects.
 * Uses the same in-memory SQLite D1 shim and Hono app factory style as
 * the existing shares.test.ts / tree-read.test.ts integration tests.
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

async function seedPerson(
  db: ReturnType<typeof drizzle<typeof schema>>,
  overrides: Partial<typeof schema.people.$inferInsert> = {},
) {
  await db.insert(schema.people).values({
    id: 'person1',
    tree_id: 'tree1',
    name: 'Test Person',
    deceased: false,
    died: null,
    born: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Suite: auth + ownership
// ---------------------------------------------------------------------------

describe('PATCH /api/tree/:slug/person/:personId — auth + ownership', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, null);
    await seedOwnerAndTree(db);
    await seedPerson(db);
  });

  test('no session → 401', async () => {
    const { app } = makeApp(d1, null);
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: null,
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  test('non-owner → 404 (anti-enumeration)', async () => {
    const { app } = makeApp(d1, { id: 'other1', email: 'other@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: null,
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('not found');
  });
});

// ---------------------------------------------------------------------------
// Suite: person-not-in-tree
// ---------------------------------------------------------------------------

describe('PATCH /api/tree/:slug/person/:personId — person not in tree', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);
    // Seed a second tree with its own person to test cross-tree isolation
    await db.insert(schema.trees).values({
      id: 'tree2',
      slug: 'other-tree',
      name: 'Other Tree',
      owner_id: 'owner1',
      visibility: 'public',
    });
    await db.insert(schema.people).values({
      id: 'person-other',
      tree_id: 'tree2',
      name: 'Other Person',
      deceased: false,
    });
  });

  test('person belongs to a different tree → 404', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    // person-other is in tree2, not test-tree
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person-other', {
      deceased: true,
      died: null,
    });
    expect(res.status).toBe(404);
  });

  test('person id does not exist → 404', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/nonexistent', {
      deceased: true,
      died: null,
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Suite: successful mutations
// ---------------------------------------------------------------------------

describe('PATCH /api/tree/:slug/person/:personId — successful mutations', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);
    await seedPerson(db, { born: 1950 });
  });

  test('set deceased=true with a valid year → 200, {deceased:true, died:2000}', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: 2000,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { deceased: boolean; died: number | null };
    expect(body.deceased).toBe(true);
    expect(body.died).toBe(2000);
  });

  test('set deceased=true with died=null (year unknown) → 200, {deceased:true, died:null}', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: null,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { deceased: boolean; died: number | null };
    expect(body.deceased).toBe(true);
    expect(body.died).toBeNull();
  });

  test('set deceased=false (back to alive) → died forced to null even if sent', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    // First mark as deceased+year
    await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: 2000,
    });

    // Now mark as alive — died should be forced to null
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: false,
      died: 2000, // caller sends a year but it should be ignored
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { deceased: boolean; died: number | null };
    expect(body.deceased).toBe(false);
    expect(body.died).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: year validation (422)
// ---------------------------------------------------------------------------

describe('PATCH /api/tree/:slug/person/:personId — year validation', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);
    await seedPerson(db, { born: 1950 });
  });

  test('died < born → 422 invalid_year', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: 1940, // before born=1950
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_year');
  });

  test('died > currentYear → 422 invalid_year', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const futureYear = new Date().getFullYear() + 1;
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: futureYear,
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_year');
  });

  test('died == born → 200 (edge case: same year)', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: 1950, // same as born
    });
    expect(res.status).toBe(200);
  });

  test('died valid when person has no born (no born constraint) → 200', async () => {
    // Insert a person without a birth year
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await db.insert(schema.people).values({
      id: 'person-noborn',
      tree_id: 'tree1',
      name: 'No Born',
      deceased: false,
      born: null,
    });

    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const currentYear = new Date().getFullYear();
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person-noborn', {
      deceased: true,
      died: currentYear - 10,
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Suite: invalid body
// ---------------------------------------------------------------------------

describe('PATCH /api/tree/:slug/person/:personId — invalid body', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);
    await seedPerson(db);
  });

  test('non-JSON body → 400', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await app.fetch(
      new Request('http://localhost/api/tree/test-tree/person/person1', {
        method: 'PATCH',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_body');
  });

  test('partial update: died-only (no deceased) on an alive person → 200, died forced null', async () => {
    // ws09: PATCH is now a partial update — any subset of fields is allowed, so a
    // missing `deceased` is no longer a 400. person1 is alive, so the deceased/died
    // consistency rule forces died back to null regardless of the sent year.
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      died: 2000,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { died?: number | null };
    expect(body.died ?? null).toBeNull();
  });

  test('deceased is a string instead of boolean → 400', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: 'yes',
      died: null,
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Suite: GET tree reflects persisted change (cache purge)
// ---------------------------------------------------------------------------

describe('PATCH then GET — change reflected in subsequent read', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);
    await seedPerson(db, { born: 1950 });
  });

  test('after PATCH deceased=true, GET /api/tree/:slug reflects deceased=true', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    // Mutate
    const patchRes = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: 2000,
    });
    expect(patchRes.status).toBe(200);

    // Read back via GET — same app instance so same in-memory DB
    const getRes = await makeReq(app, 'GET', '/api/tree/test-tree');
    expect(getRes.status).toBe(200);
    const data = await getRes.json() as { people: Array<{ id: string; deceased: boolean; died: number | null }> };
    const person = data.people.find((p) => p.id === 'person1');
    expect(person).toBeDefined();
    expect(person!.deceased).toBe(true);
    expect(person!.died).toBe(2000);
  });

  test('after PATCH deceased=false, GET shows deceased=false and died=null', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    // First set deceased
    await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: 2000,
    });

    // Now revert to alive
    const patchRes = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: false,
      died: null,
    });
    expect(patchRes.status).toBe(200);

    // Read back
    const getRes = await makeReq(app, 'GET', '/api/tree/test-tree');
    expect(getRes.status).toBe(200);
    const data = await getRes.json() as { people: Array<{ id: string; deceased: boolean; died: number | null }> };
    const person = data.people.find((p) => p.id === 'person1');
    expect(person).toBeDefined();
    expect(person!.deceased).toBe(false);
    expect(person!.died).toBeNull();
  });
});
