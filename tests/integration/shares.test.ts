/**
 * Integration tests for share management routes.
 *
 * Tests GET/POST/DELETE /:slug/shares and PATCH /:slug/visibility
 * mounted at /api/tree via sharesRouter.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import * as schema from '../../src/db/schema';
import { sharesRouter } from '../../src/worker/routes/shares';
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
  app.route('/api/tree', sharesRouter);
  return { app, db, d1 };
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
    visibility: 'private',
  });
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
// Suite: GET /:slug/shares
// ---------------------------------------------------------------------------

describe('GET /api/tree/:slug/shares', () => {
  test('owner lists shares → 200 with array', async () => {
    const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'GET', '/api/tree/test-tree/shares');
    expect(res.status).toBe(200);
    const body = await res.json() as { shares: unknown[] };
    expect(Array.isArray(body.shares)).toBe(true);
    expect(body.shares).toHaveLength(0);
  });

  test('non-owner lists shares → 404', async () => {
    const { app, db } = await setup({ id: 'other1', email: 'other@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'GET', '/api/tree/test-tree/shares');
    expect(res.status).toBe(404);
  });

  test('anonymous lists shares → 401', async () => {
    const { app, db } = await setup(null);
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'GET', '/api/tree/test-tree/shares');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Suite: POST /:slug/shares
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/shares', () => {
  test('owner invites bob@example.com (no account) → 201, pending, user_id=null', async () => {
    const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'bob@example.com',
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { share: Record<string, unknown> };
    expect(body.share.email).toBe('bob@example.com');
    expect(body.share.status).toBe('pending');
    expect(body.share.user_id).toBeNull();
    expect(body.share.role).toBe('viewer');
    expect(body.share.invited_by).toBe('owner1');
  });

  test('owner invites existing verified user charlie@example.com → 201, accepted, user_id set', async () => {
    const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);
    // Create charlie
    await db.insert(schema.users).values({
      id: 'charlie1',
      email: 'charlie@example.com',
      email_verified_at: 100,
    });

    const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'charlie@example.com',
      role: 'editor',
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { share: Record<string, unknown> };
    expect(body.share.status).toBe('accepted');
    expect(body.share.user_id).toBe('charlie1');
    expect(body.share.accepted_at).not.toBeNull();
    expect(body.share.role).toBe('editor');
  });

  test('owner invites with MIXED CASE email → stored lowercase', async () => {
    const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'Bob@Example.com',
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { share: Record<string, unknown> };
    expect(body.share.email).toBe('bob@example.com');
  });

  test('re-invite same email → upsert (no conflict); revoked → pending', async () => {
    const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    // First invite
    const res1 = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'bob@example.com',
    });
    expect(res1.status).toBe(201);
    const body1 = await res1.json() as { share: Record<string, unknown> };
    const shareId = body1.share.id as string;

    // Revoke it
    const delRes = await makeReq(app, 'DELETE', `/api/tree/test-tree/shares/${shareId}`);
    expect(delRes.status).toBe(204);

    // Re-invite
    const res2 = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'bob@example.com',
    });
    expect(res2.status).toBe(201);
    const body2 = await res2.json() as { share: Record<string, unknown> };
    expect(body2.share.status).toBe('pending');
  });

  test('invalid role in body → 422', async () => {
    const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'bob@example.com',
      role: 'superadmin',
    });
    expect(res.status).toBe(422);
  });

  // -------------------------------------------------------------------------
  // N-R3-7 — email format validation
  // -------------------------------------------------------------------------

  describe('N-R3-7 — email format validation', () => {
    test('malformed email (no @) → 422', async () => {
      const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
      await seedOwnerAndTree(db);
      const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
        email: 'not-an-email',
      });
      expect(res.status).toBe(422);
    });

    test('empty email → 422', async () => {
      const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
      await seedOwnerAndTree(db);
      const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
        email: '',
      });
      expect(res.status).toBe(422);
    });

    test('email with scripty garbage → 422', async () => {
      const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
      await seedOwnerAndTree(db);
      const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
        email: 'bob+<script>alert(1)</script>@example.com',
      });
      // zod `.email()` rejects this — must be 422.
      expect(res.status).toBe(422);
    });

    test('over-long email (>254) → 422', async () => {
      const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
      await seedOwnerAndTree(db);
      const longLocal = 'a'.repeat(260);
      const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
        email: `${longLocal}@example.com`,
      });
      expect(res.status).toBe(422);
    });

    test('email with surrounding whitespace → trimmed + accepted → 201', async () => {
      const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
      await seedOwnerAndTree(db);
      const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
        email: '  trimmed@example.com  ',
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { share: { email: string } };
      expect(body.share.email).toBe('trimmed@example.com');
    });
  });

  test('non-owner invites → 404', async () => {
    const { app, db } = await setup({ id: 'other1', email: 'other@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'bob@example.com',
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Suite: DELETE /:slug/shares/:shareId
// ---------------------------------------------------------------------------

describe('DELETE /api/tree/:slug/shares/:shareId', () => {
  test('owner deletes → 204, row status=revoked', async () => {
    const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    // Create a share first
    const postRes = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'bob@example.com',
    });
    const postBody = await postRes.json() as { share: Record<string, unknown> };
    const shareId = postBody.share.id as string;

    const delRes = await makeReq(app, 'DELETE', `/api/tree/test-tree/shares/${shareId}`);
    expect(delRes.status).toBe(204);

    // Verify row is revoked (not deleted)
    const listRes = await makeReq(app, 'GET', '/api/tree/test-tree/shares');
    const listBody = await listRes.json() as { shares: Array<Record<string, unknown>> };
    const share = listBody.shares.find((s) => s.id === shareId);
    expect(share).toBeDefined();
    expect(share!.status).toBe('revoked');
  });

  test('non-owner deletes → 404', async () => {
    const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    const postRes = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'bob@example.com',
    });
    const postBody = await postRes.json() as { share: Record<string, unknown> };
    const shareId = postBody.share.id as string;

    // Now act as a different user
    const { app: app2 } = await setup({ id: 'other1', email: 'other@example.com' });
    // Need to set up same DB — rebuild with different user but same db
    const d1 = createSqliteD1();
    const db2 = drizzle(d1 as unknown as D1Database, { schema });
    const app3 = new Hono<HonoEnv>();
    app3.use(async (c, next) => { c.set('db', db2); return next(); });
    app3.use(async (c, next) => {
      c.set('user', { id: 'other1', email: 'other@example.com', email_verified_at: 1 });
      return next();
    });
    app3.route('/api/tree', sharesRouter);

    // Setup same data in db2
    await db2.insert(schema.users).values({
      id: 'owner1',
      email: 'owner@example.com',
      email_verified_at: 1,
    });
    await db2.insert(schema.trees).values({
      id: 'tree1',
      slug: 'test-tree',
      name: 'Test Tree',
      owner_id: 'owner1',
      visibility: 'private',
    });

    const res = await makeReq(app3, 'DELETE', `/api/tree/test-tree/shares/${shareId}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Suite: PATCH /:slug/visibility
// ---------------------------------------------------------------------------

describe('PATCH /api/tree/:slug/visibility', () => {
  test('owner patches visibility to shared → 200', async () => {
    const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/visibility', {
      visibility: 'shared',
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { visibility: string };
    expect(body.visibility).toBe('shared');
  });

  test('patch visibility to invalid value → 422', async () => {
    const { app, db } = await setup({ id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/visibility', {
      visibility: 'mega-public',
    });
    expect(res.status).toBe(422);
  });

  test('non-owner patches visibility → 404', async () => {
    const { app, db } = await setup({ id: 'other1', email: 'other@example.com' });
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'PATCH', '/api/tree/test-tree/visibility', {
      visibility: 'public',
    });
    expect(res.status).toBe(404);
  });
});
