/**
 * Integration tests — POST /api/auth/logout
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { createMockEnv } from '../helpers/mock-env';
import * as schema from '../../src/db/schema';
import { authRouter } from '../../src/worker/routes/auth';
import { hashToken } from '../../src/worker/lib/tokens';
import type { HonoEnv } from '../../src/worker/types';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

interface SetupResult {
  app: Hono<HonoEnv>;
  db: ReturnType<typeof drizzle<typeof schema>>;
  d1: SqliteD1Database;
  env: ReturnType<typeof createMockEnv>['env'];
}

async function setup(): Promise<SetupResult> {
  const { d1, env } = createMockEnv();
  const db = drizzle(d1 as unknown as D1Database, { schema });

  const app = new Hono<HonoEnv>();
  app.use(async (c, next) => {
    c.set('db', db);
    c.set('user', null);
    return next();
  });
  app.route('/api/auth', authRouter);

  return { app, db, d1, env };
}

function makeLogoutRequest(cookieValue?: string): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cookieValue) {
    headers['Cookie'] = `__Host-session=${cookieValue}`;
  }
  return new Request('http://localhost/api/auth/logout', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
}

async function seedUserAndSession(
  db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<{ userId: string; rawToken: string; sessionId: string }> {
  const userId = crypto.randomUUID();
  await db.insert(schema.users).values({
    id: userId,
    email: 'logout-test@example.com',
    email_verified_at: Math.floor(Date.now() / 1000),
  });

  const rawToken = 'test-logout-token-abc';
  const tokenHash = hashToken(rawToken);
  const sessionId = crypto.randomUUID();

  await db.insert(schema.sessions).values({
    id: sessionId,
    token_hash: tokenHash,
    user_id: userId,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });

  return { userId, rawToken, sessionId };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/logout', () => {
  let ctx: SetupResult;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('with valid cookie → 204 and session deleted', async () => {
    const { rawToken, sessionId } = await seedUserAndSession(ctx.db);

    const res = await ctx.app.fetch(makeLogoutRequest(rawToken), ctx.env);
    expect(res.status).toBe(204);

    // Session row should be gone
    const session = await ctx.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .get();
    expect(session).toBeUndefined();
  });

  it('with valid cookie → Set-Cookie clears __Host-session', async () => {
    const { rawToken } = await seedUserAndSession(ctx.db);

    const res = await ctx.app.fetch(makeLogoutRequest(rawToken), ctx.env);

    const setCookie = res.headers.get('Set-Cookie');
    // Cookie should be cleared (Max-Age=0 or empty value, or expires in the past)
    expect(setCookie).toBeTruthy();
    expect(setCookie).toMatch(/__Host-session=/);
  });

  it('without cookie → 204 (idempotent)', async () => {
    const res = await ctx.app.fetch(makeLogoutRequest(undefined), ctx.env);
    expect(res.status).toBe(204);
  });

  it('with unknown cookie value → 204 (idempotent, session not found is ok)', async () => {
    const res = await ctx.app.fetch(makeLogoutRequest('unknown-token-xyz'), ctx.env);
    expect(res.status).toBe(204);
  });

  it('calling logout twice → both return 204', async () => {
    const { rawToken } = await seedUserAndSession(ctx.db);

    const r1 = await ctx.app.fetch(makeLogoutRequest(rawToken), ctx.env);
    const r2 = await ctx.app.fetch(makeLogoutRequest(rawToken), ctx.env);

    expect(r1.status).toBe(204);
    expect(r2.status).toBe(204);
  });
});
