/**
 * Integration tests for session middleware (sessionMiddleware + requireAuth).
 *
 * Uses an isolated Hono app — does NOT import src/worker/index.ts.
 * DB is injected via a middleware so the test controls the exact drizzle instance.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import { createMockEnv } from '../helpers/mock-env';
import * as schema from '../../src/db/schema';
import {
  sessionMiddleware,
  requireAuth,
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_SECONDS,
  SESSION_SLIDING_REFRESH_THRESHOLD_SECONDS,
} from '../../src/worker/middleware/session';
import { hashToken } from '../../src/worker/lib/tokens';
import type { HonoEnv } from '../../src/worker/types';

// ---------------------------------------------------------------------------
// Test app factory — each test gets a fresh DB instance
// ---------------------------------------------------------------------------

async function setup() {
  const d1 = createSqliteD1();
  const db = drizzle(d1 as unknown as D1Database, { schema });
  const { env } = createMockEnv();
  // Override DB with this specific d1 instance
  env.DB = d1 as unknown as D1Database;

  const app = new Hono<HonoEnv>();
  // Inject db into c.var so sessionMiddleware can access it
  app.use(async (c, next) => {
    c.set('db', db);
    return next();
  });
  app.use(sessionMiddleware);
  app.get('/me', (c) => c.json({ user: c.var.user }));
  app.get('/protected', requireAuth, (c) => c.json({ ok: true }));

  return { app, db, d1, env };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCookieHeader(token: string): HeadersInit {
  return { Cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionMiddleware', () => {
  it('sets user=null when no cookie', async () => {
    const { app, env } = await setup();
    const res = await app.request('/me', {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it('sets user=null when cookie has no matching session', async () => {
    const { app, env } = await setup();
    const res = await app.request(
      '/me',
      { headers: makeCookieHeader('nonexistent-token') },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it('populates user for a valid non-expired session', async () => {
    const { app, db, env } = await setup();

    // Seed user
    await db.insert(schema.users).values({
      id: 'u1',
      email: 'a@b.com',
      email_verified_at: 1000,
    });

    // Seed session
    const raw = 'fixed-token-for-test';
    const tokenHash = hashToken(raw);
    const now = nowSeconds();
    await db.insert(schema.sessions).values({
      id: 's1',
      token_hash: tokenHash,
      user_id: 'u1',
      expires_at: now + 3600,
    });

    const res = await app.request(
      '/me',
      { headers: makeCookieHeader(raw) },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { user: unknown };
    expect(body.user).toMatchObject({
      id: 'u1',
      email: 'a@b.com',
      email_verified_at: 1000,
    });
    // Must NOT expose sensitive fields
    expect((body.user as Record<string, unknown>).password_hash).toBeUndefined();
    expect((body.user as Record<string, unknown>).failed_login_count).toBeUndefined();
  });

  it('ignores expired session → user=null', async () => {
    const { app, db, env } = await setup();

    await db.insert(schema.users).values({ id: 'u2', email: 'exp@test.com' });

    const raw = 'expired-token';
    const tokenHash = hashToken(raw);
    const now = nowSeconds();
    await db.insert(schema.sessions).values({
      id: 's2',
      token_hash: tokenHash,
      user_id: 'u2',
      expires_at: now - 60, // already expired
    });

    const res = await app.request(
      '/me',
      { headers: makeCookieHeader(raw) },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it('requireAuth blocks anonymous request with 401', async () => {
    const { app, env } = await setup();
    const res = await app.request('/protected', {}, env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('requireAuth allows authenticated user', async () => {
    const { app, db, env } = await setup();

    await db.insert(schema.users).values({ id: 'u3', email: 'ok@test.com' });

    const raw = 'authed-token';
    const tokenHash = hashToken(raw);
    const now = nowSeconds();
    await db.insert(schema.sessions).values({
      id: 's3',
      token_hash: tokenHash,
      user_id: 'u3',
      expires_at: now + 3600,
    });

    const res = await app.request(
      '/protected',
      { headers: makeCookieHeader(raw) },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('sliding refresh extends expires_at when <7 days remain', async () => {
    const { app, db, env } = await setup();

    await db.insert(schema.users).values({ id: 'u4', email: 'slide@test.com' });

    const raw = 'sliding-token';
    const tokenHash = hashToken(raw);
    const now = nowSeconds();
    // 3 days remaining → below 7-day threshold
    const originalExpiry = now + 60 * 60 * 24 * 3;
    await db.insert(schema.sessions).values({
      id: 's4',
      token_hash: tokenHash,
      user_id: 'u4',
      expires_at: originalExpiry,
    });

    await app.request('/me', { headers: makeCookieHeader(raw) }, env);

    // Give the fire-and-forget write time to settle (synchronous in test env)
    await new Promise((r) => setTimeout(r, 10));

    // Re-query session to verify extension
    const { eq } = await import('drizzle-orm');
    const updated = await db.query.sessions.findFirst({
      where: eq(schema.sessions.id, 's4'),
    });
    expect(updated).toBeDefined();
    const expectedExpiry = now + SESSION_LIFETIME_SECONDS;
    // Allow ±5s tolerance
    expect(updated!.expires_at).toBeGreaterThanOrEqual(expectedExpiry - 5);
    expect(updated!.expires_at).toBeLessThanOrEqual(expectedExpiry + 5);
  });

  it('does not refresh when plenty of time remains', async () => {
    const { app, db, env } = await setup();

    await db.insert(schema.users).values({ id: 'u5', email: 'plenty@test.com' });

    const raw = 'plenty-token';
    const tokenHash = hashToken(raw);
    const now = nowSeconds();
    // 10 days remaining → above 7-day threshold
    const originalExpiry = now + 60 * 60 * 24 * 10;
    await db.insert(schema.sessions).values({
      id: 's5',
      token_hash: tokenHash,
      user_id: 'u5',
      expires_at: originalExpiry,
    });

    await app.request('/me', { headers: makeCookieHeader(raw) }, env);
    await new Promise((r) => setTimeout(r, 10));

    const { eq } = await import('drizzle-orm');
    const session = await db.query.sessions.findFirst({
      where: eq(schema.sessions.id, 's5'),
    });
    expect(session).toBeDefined();
    // expires_at must remain unchanged (within ±1s for clock drift)
    expect(Math.abs(session!.expires_at! - originalExpiry)).toBeLessThanOrEqual(1);
  });

  it('does not throw on malformed cookie — returns 200 with user=null', async () => {
    const { app, env } = await setup();
    // Use a cookie value that passes HTTP validation but has no matching DB session.
    // Null bytes are rejected by the HTTP layer before reaching our middleware, so we
    // use a syntactically weird but HTTP-safe token to exercise the error-handling path.
    const res = await app.request(
      '/me',
      { headers: makeCookieHeader('!!!INVALID-SESSION-TOKEN!!!') },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });
});
