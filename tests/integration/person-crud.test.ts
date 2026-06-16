/**
 * Integration tests for person CRUD endpoints:
 *   POST   /api/tree/:slug/person
 *   PATCH  /api/tree/:slug/person/:personId  (extended ws09 partial update)
 *   DELETE /api/tree/:slug/person/:personId
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
// Suite: POST /:slug/person — auth + ownership
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/person — auth + ownership', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, null);
    await seedOwnerAndTree(db);
  });

  test('no session → 401', async () => {
    const { app } = makeApp(d1, null);
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/person', {
      name: 'Alice',
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  test('non-owner → 404 (anti-enumeration)', async () => {
    const { app } = makeApp(d1, { id: 'other1', email: 'other@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/person', {
      name: 'Alice',
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('not found');
  });
});

// ---------------------------------------------------------------------------
// Suite: POST /:slug/person — successful creation
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/person — successful creation', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);
  });

  test('minimal body (name only) → 201, returns person with defaults', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/person', {
      name: 'Alice',
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { person: Record<string, unknown> };
    expect(body.person).toBeDefined();
    expect(body.person.name).toBe('Alice');
    expect(body.person.id).toBeTruthy();
    expect(body.person.tree_id).toBe('tree1');
    expect(body.person.gender).toBe('m'); // default
    expect(body.person.deceased).toBe(false); // default
    expect(body.person.died).toBeNull();
  });

  test('full body → 201, all fields persisted', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/person', {
      name: 'Bob',
      nameEn: 'Bob Smith',
      nick: 'Bobby',
      born: 1980,
      hometown: 'Bangkok',
      gender: 'f',
      deceased: false,
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { person: Record<string, unknown> };
    expect(body.person.name).toBe('Bob');
    expect(body.person.nameEn).toBe('Bob Smith');
    expect(body.person.nick).toBe('Bobby');
    expect(body.person.born).toBe(1980);
    expect(body.person.hometown).toBe('Bangkok');
    expect(body.person.gender).toBe('f');
    expect(body.person.deceased).toBe(false);
  });

  test('deceased=true with valid died year → 201', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/person', {
      name: 'Elder',
      born: 1900,
      deceased: true,
      died: 1980,
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { person: Record<string, unknown> };
    expect(body.person.deceased).toBe(true);
    expect(body.person.died).toBe(1980);
  });

  test('name trimmed correctly', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/person', {
      name: '  Alice  ',
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { person: Record<string, unknown> };
    expect(body.person.name).toBe('Alice');
  });
});

// ---------------------------------------------------------------------------
// Suite: POST /:slug/person — validation errors
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/person — validation', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);
  });

  test('missing name → 400 invalid_body', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/person', {
      nick: 'no-name',
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_body');
  });

  test('empty name → 400 invalid_body', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/person', {
      name: '',
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_body');
  });

  test('name too long (>200 chars) → 400 invalid_body', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/person', {
      name: 'a'.repeat(201),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_body');
  });

  test('died > currentYear → 422 invalid_year', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const futureYear = new Date().getFullYear() + 1;
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/person', {
      name: 'Future Person',
      deceased: true,
      died: futureYear,
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_year');
  });

  test('died < born → 422 invalid_year', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'POST', '/api/tree/test-tree/person', {
      name: 'Oops',
      born: 1980,
      deceased: true,
      died: 1970,
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_year');
  });

  test('non-JSON body → 400', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await app.fetch(
      new Request('http://localhost/api/tree/test-tree/person', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_body');
  });
});

// ---------------------------------------------------------------------------
// Suite: PATCH /:slug/person/:personId — extended partial update (ws09)
// ---------------------------------------------------------------------------

describe('PATCH /api/tree/:slug/person/:personId — extended partial update', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);
    await seedPerson(db, { born: 1960, name: 'Original Name', gender: 'm' });
  });

  test('patch name only → 200, name updated', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      name: 'New Name',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.name).toBe('New Name');
  });

  test('patch nick → 200, nick updated', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      nick: 'Buddy',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.nick).toBe('Buddy');
  });

  test('patch born year only → 200, born updated', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      born: 1970,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.born).toBe(1970);
  });

  test('patch hometown → 200, hometown updated', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      hometown: 'Chiang Mai',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.hometown).toBe('Chiang Mai');
  });

  test('patch gender → 200, gender updated', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      gender: 'f',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.gender).toBe('f');
  });

  test('patch deceased+died together with valid year → 200', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: 2000,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.deceased).toBe(true);
    expect(body.died).toBe(2000);
  });

  test('patch died when person has born=1960: died=1959 → 422 invalid_year', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    // First mark deceased so we can test the born constraint
    await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      deceased: true,
      died: 2000,
    });
    // Now patch died to before born
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {
      died: 1959,
    });
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_year');
  });

  test('empty body (no fields) → 400 invalid_body', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/person/person1', {});
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_body');
  });

  test('existing ws08 status-only tests still pass: deceased+died → 200', async () => {
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
});

// ---------------------------------------------------------------------------
// Suite: DELETE /:slug/person/:personId — auth + ownership
// ---------------------------------------------------------------------------

describe('DELETE /api/tree/:slug/person/:personId — auth + ownership', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, null);
    await seedOwnerAndTree(db);
    await seedPerson(db);
  });

  test('no session → 401', async () => {
    const { app } = makeApp(d1, null);
    const res = await makeReq(app, 'DELETE', '/api/tree/test-tree/person/person1');
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  test('non-owner → 404 (anti-enumeration)', async () => {
    const { app } = makeApp(d1, { id: 'other1', email: 'other@example.com' });
    const res = await makeReq(app, 'DELETE', '/api/tree/test-tree/person/person1');
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('not found');
  });
});

// ---------------------------------------------------------------------------
// Suite: DELETE /:slug/person/:personId — successful deletion
// ---------------------------------------------------------------------------

describe('DELETE /api/tree/:slug/person/:personId — successful deletion', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);
    await seedPerson(db);
  });

  test('delete existing person → 200, {ok: true}', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'DELETE', '/api/tree/test-tree/person/person1');
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('delete non-existent person → 404', async () => {
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'DELETE', '/api/tree/test-tree/person/nonexistent');
    expect(res.status).toBe(404);
  });

  test('person in different tree → 404', async () => {
    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    // Add a second tree (also owned by owner1 to avoid auth issues)
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
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    // Try to delete person-other via test-tree slug → 404 (cross-tree isolation)
    const res = await makeReq(app, 'DELETE', '/api/tree/test-tree/person/person-other');
    expect(res.status).toBe(404);
  });

  test('delete person cascades relations — relations are gone after delete', async () => {
    // Enable FK constraints in the SQLite shim so ON DELETE CASCADE fires
    d1._sqlite.pragma('foreign_keys = ON');

    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    // Add a second person and a relation
    await db.insert(schema.people).values({
      id: 'person2',
      tree_id: 'tree1',
      name: 'Person 2',
      deceased: false,
    });
    await db.insert(schema.relations).values({
      tree_id: 'tree1',
      from_id: 'person1',
      to_id: 'person2',
      kind: 'parent',
    });

    // Verify relation exists
    const { db: db2 } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const beforeDelete = await db2.query.relations.findMany({
      where: (r, { eq }) => eq(r.tree_id, 'tree1'),
    });
    expect(beforeDelete).toHaveLength(1);

    // Delete person1 (person must be deleted, relations cascade via FK)
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'DELETE', '/api/tree/test-tree/person/person1');
    expect(res.status).toBe(200);

    // Verify relation is gone
    const { db: db3 } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const afterDelete = await db3.query.relations.findMany({
      where: (r, { eq }) => eq(r.tree_id, 'tree1'),
    });
    expect(afterDelete).toHaveLength(0);
  });

  test('delete person cascades both incoming and outgoing relations', async () => {
    // Enable FK constraints in the SQLite shim so ON DELETE CASCADE fires
    d1._sqlite.pragma('foreign_keys = ON');

    const { db } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });

    // Add two more people
    await db.insert(schema.people).values([
      { id: 'person2', tree_id: 'tree1', name: 'Person 2', deceased: false },
      { id: 'person3', tree_id: 'tree1', name: 'Person 3', deceased: false },
    ]);

    // person1 is parent of person2, person3 is parent of person1
    await db.insert(schema.relations).values([
      { tree_id: 'tree1', from_id: 'person1', to_id: 'person2', kind: 'parent' },
      { tree_id: 'tree1', from_id: 'person3', to_id: 'person1', kind: 'parent' },
    ]);

    // Delete person1
    const { app } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeReq(app, 'DELETE', '/api/tree/test-tree/person/person1');
    expect(res.status).toBe(200);

    // Both relations should be gone
    const { db: db2 } = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const remaining = await db2.query.relations.findMany({
      where: (r, { eq }) => eq(r.tree_id, 'tree1'),
    });
    expect(remaining).toHaveLength(0);
  });
});
