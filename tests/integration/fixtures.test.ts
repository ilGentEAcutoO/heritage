/**
 * Smoke tests for the shared test fixtures (tests/helpers/fixtures.ts).
 *
 * Exercises seedUser, seedSession, and seedShare end-to-end:
 *   - seedUser + seedSession → hit GET /api/auth/me with real session cookie → 200
 *   - seedShare → verify the row exists with correct fields
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import { createMockEnv } from '../helpers/mock-env';
import { seedUser, seedSession, seedShare } from '../helpers/fixtures';
import * as schema from '../../src/db/schema';
import { authRouter } from '../../src/worker/routes/auth';
import { sessionMiddleware } from '../../src/worker/middleware/session';
import type { HonoEnv } from '../../src/worker/types';

// ---------------------------------------------------------------------------
// App factory that wires the real session middleware + auth router.
// Mirrors the production middleware stack without importing the full worker.
// ---------------------------------------------------------------------------

function makeApp(db: ReturnType<typeof drizzle<typeof schema>>) {
  const app = new Hono<HonoEnv>();
  app.use(async (c, next) => {
    c.set('db', db);
    return next();
  });
  app.use(sessionMiddleware);
  app.route('/api/auth', authRouter);
  return app;
}

// ---------------------------------------------------------------------------
// seedUser
// ---------------------------------------------------------------------------

describe('seedUser', () => {
  it('inserts a verified user row with a hashed password', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });

    const user = await seedUser(d1, {
      email: 'alice@example.com',
      password: 'hunter2!',
      verified: true,
    });

    expect(user.id).toBeTruthy();
    expect(user.email).toBe('alice@example.com');
    expect(user.password).toBe('hunter2!');
    expect(user.passwordHash).toHaveLength(128); // 64 bytes hex
    expect(user.passwordSalt).toHaveLength(32);  // 16 bytes hex

    const row = await db.query.users.findFirst({
      where: eq(schema.users.id, user.id),
    });
    expect(row).toBeDefined();
    expect(row!.email).toBe('alice@example.com');
    expect(row!.email_verified_at).not.toBeNull();
  });

  it('inserts an unverified user when verified=false', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });

    const user = await seedUser(d1, {
      email: 'bob@example.com',
      verified: false,
    });

    const row = await db.query.users.findFirst({
      where: eq(schema.users.id, user.id),
    });
    expect(row!.email_verified_at).toBeNull();
  });

  it('lower-cases email on insert', async () => {
    const d1 = createSqliteD1();
    const user = await seedUser(d1, { email: 'UPPER@Example.Com' });
    expect(user.email).toBe('upper@example.com');
  });
});

// ---------------------------------------------------------------------------
// seedSession
// ---------------------------------------------------------------------------

describe('seedSession', () => {
  it('inserts a session row and returns raw token + cookieHeader', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });

    const user = await seedUser(d1, { email: 'sess@example.com' });
    const session = await seedSession(d1, user.id);

    expect(session.raw).toBeTruthy();
    expect(session.tokenHash).toHaveLength(64); // SHA-256 hex
    expect(session.cookieHeader).toBe(`__Host-session=${session.raw}`);

    const row = await db.query.sessions.findFirst({
      where: eq(schema.sessions.token_hash, session.tokenHash),
    });
    expect(row).toBeDefined();
    expect(row!.user_id).toBe(user.id);
  });

  it('respects custom expiresAtSeconds', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });

    const user = await seedUser(d1, { email: 'exp@example.com' });
    const future = Math.floor(Date.now() / 1000) + 99999;
    const session = await seedSession(d1, user.id, { expiresAtSeconds: future });

    const row = await db.query.sessions.findFirst({
      where: eq(schema.sessions.token_hash, session.tokenHash),
    });
    expect(row!.expires_at).toBe(future);
  });
});

// ---------------------------------------------------------------------------
// seedUser + seedSession → GET /api/auth/me end-to-end
// ---------------------------------------------------------------------------

describe('fixtures end-to-end: GET /api/auth/me with seeded session cookie', () => {
  let d1: ReturnType<typeof createSqliteD1>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let env: ReturnType<typeof createMockEnv>['env'];

  beforeEach(() => {
    d1 = createSqliteD1();
    db = drizzle(d1 as unknown as D1Database, { schema });
    env = createMockEnv().env;
    // Override DB binding to match our d1 instance
    env.DB = d1 as unknown as D1Database;
  });

  it('seeded session cookie resolves to 200 with correct email', async () => {
    const user = await seedUser(d1, {
      email: 'realuser@example.com',
      password: 'Passw0rd!',
      verified: true,
    });
    const session = await seedSession(d1, user.id);

    const app = makeApp(db);
    const res = await app.request(
      '/api/auth/me',
      { headers: { Cookie: session.cookieHeader } },
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { user: { id: string; email: string } };
    expect(body.user.id).toBe(user.id);
    expect(body.user.email).toBe('realuser@example.com');
  });

  it('request without cookie → 401', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/auth/me', {}, env);
    expect(res.status).toBe(401);
  });

  it('expired session → 401', async () => {
    const user = await seedUser(d1, {
      email: 'expired@example.com',
      verified: true,
    });
    const pastExpiry = Math.floor(Date.now() / 1000) - 60;
    const session = await seedSession(d1, user.id, { expiresAtSeconds: pastExpiry });

    const app = makeApp(db);
    const res = await app.request(
      '/api/auth/me',
      { headers: { Cookie: session.cookieHeader } },
      env,
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// seedShare
// ---------------------------------------------------------------------------

describe('seedShare', () => {
  it('inserts a pending share row', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });

    // Seed prerequisite rows
    await db.insert(schema.users).values({
      id: 'owner1',
      email: 'owner@example.com',
      email_verified_at: 1,
    });
    await db.insert(schema.trees).values({
      id: 'tree1',
      slug: 'fam',
      name: 'Family',
      owner_id: 'owner1',
      visibility: 'private',
    });

    const share = await seedShare(d1, {
      treeId: 'tree1',
      email: 'guest@example.com',
      invitedBy: 'owner1',
    });

    expect(share.id).toBeTruthy();
    expect(share.email).toBe('guest@example.com');
    expect(share.status).toBe('pending');
    expect(share.role).toBe('viewer');
    expect(share.user_id).toBeNull();
    expect(share.accepted_at).toBeNull();
  });

  it('inserts an accepted share row', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });

    await db.insert(schema.users).values([
      { id: 'owner1', email: 'owner@example.com', email_verified_at: 1 },
      { id: 'guest1', email: 'guest@example.com', email_verified_at: 1 },
    ]);
    await db.insert(schema.trees).values({
      id: 'tree1',
      slug: 'fam',
      name: 'Family',
      owner_id: 'owner1',
      visibility: 'shared',
    });

    const share = await seedShare(d1, {
      treeId: 'tree1',
      email: 'guest@example.com',
      invitedBy: 'owner1',
      userId: 'guest1',
      role: 'editor',
      status: 'accepted',
    });

    expect(share.status).toBe('accepted');
    expect(share.role).toBe('editor');
    expect(share.user_id).toBe('guest1');
    expect(share.accepted_at).not.toBeNull();
  });

  it('lower-cases email on insert', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });

    await db.insert(schema.users).values({
      id: 'owner2',
      email: 'owner2@example.com',
      email_verified_at: 1,
    });
    await db.insert(schema.trees).values({
      id: 'tree2',
      slug: 'fam2',
      name: 'Fam2',
      owner_id: 'owner2',
      visibility: 'private',
    });

    const share = await seedShare(d1, {
      treeId: 'tree2',
      email: 'GUEST@Example.com',
      invitedBy: 'owner2',
    });

    expect(share.email).toBe('guest@example.com');
  });
});
