/**
 * Integration tests — GET /api/auth/me
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { createMockEnv } from '../helpers/mock-env';
import * as schema from '../../src/db/schema';
import { authRouter } from '../../src/worker/routes/auth';
import type { HonoEnv } from '../../src/worker/types';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

interface SetupResult {
  app: Hono<HonoEnv>;
  db: ReturnType<typeof drizzle<typeof schema>>;
  d1: SqliteD1Database;
  env: ReturnType<typeof createMockEnv>['env'];
  authedApp: Hono<HonoEnv>; // app with seeded c.var.user
}

const TEST_USER = {
  id: 'test-user-id-123',
  email: 'me@example.com',
  email_verified_at: 1700000000 as number | null,
};

async function setup(): Promise<SetupResult> {
  const { d1, env } = createMockEnv();
  const db = drizzle(d1 as unknown as D1Database, { schema });

  // App that simulates an anonymous user (no session)
  const app = new Hono<HonoEnv>();
  app.use(async (c, next) => {
    c.set('db', db);
    c.set('user', null);
    return next();
  });
  app.route('/api/auth', authRouter);

  // App that simulates an authenticated user via a test-only middleware
  const authedApp = new Hono<HonoEnv>();
  authedApp.use(async (c, next) => {
    c.set('db', db);
    c.set('user', TEST_USER);
    return next();
  });
  authedApp.route('/api/auth', authRouter);

  return { app, db, d1, env, authedApp };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/auth/me', () => {
  let ctx: SetupResult;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('with seeded c.var.user → 200 with user object', async () => {
    const res = await ctx.authedApp.request('/api/auth/me', {}, ctx.env);
    expect(res.status).toBe(200);
    const body = await res.json() as { user: typeof TEST_USER };
    expect(body.user).toMatchObject({
      id: TEST_USER.id,
      email: TEST_USER.email,
      email_verified_at: TEST_USER.email_verified_at,
    });
  });

  it('without user (c.var.user = null) → 401 unauthorized', async () => {
    const res = await ctx.app.request('/api/auth/me', {}, ctx.env);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('returns all expected user fields', async () => {
    const res = await ctx.authedApp.request('/api/auth/me', {}, ctx.env);
    const body = await res.json() as { user: Record<string, unknown> };
    expect(body.user).toHaveProperty('id');
    expect(body.user).toHaveProperty('email');
    expect(body.user).toHaveProperty('email_verified_at');
  });

  it('returns correct email_verified_at when null', async () => {
    const { d1, env } = createMockEnv();
    const db = drizzle(d1 as unknown as D1Database, { schema });
    const nullVerifiedApp = new Hono<HonoEnv>();
    nullVerifiedApp.use(async (c, next) => {
      c.set('db', db);
      c.set('user', { id: 'u2', email: 'null-verify@example.com', email_verified_at: null });
      return next();
    });
    nullVerifiedApp.route('/api/auth', authRouter);

    const res = await nullVerifiedApp.request('/api/auth/me', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { user: { email_verified_at: null } };
    expect(body.user.email_verified_at).toBeNull();
  });
});
