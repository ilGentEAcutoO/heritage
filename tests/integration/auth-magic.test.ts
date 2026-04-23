/**
 * Integration tests — M3 magic-link auth routes
 *
 * POST /api/auth/magic/request  — issue a magic-link token
 * POST /api/auth/magic/consume  — consume a magic-link token, issue session
 *
 * 13 tests per plan § Phase M3 spec.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { createMockEnv } from '../helpers/mock-env';
import * as schema from '../../src/db/schema';
import { authRouter } from '../../src/worker/routes/auth';
import { createEmailToken, hashToken } from '../../src/worker/lib/tokens';
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

// Env cast: Hono test helpers expect Record<string, unknown>; our Env has no index sig.
const asEnv = (e: SetupResult['env']) => e as unknown as Record<string, unknown>;

function makePostRequest(
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedVerifiedUser(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email = 'magic@example.com',
): Promise<{ userId: string }> {
  const userId = crypto.randomUUID();
  await db.insert(schema.users).values({
    id: userId,
    email,
    password_hash: 'fakehash',
    password_salt: 'fakesalt',
    email_verified_at: Math.floor(Date.now() / 1000),
  });
  return { userId };
}

async function seedUnverifiedUser(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email = 'unverified@example.com',
): Promise<{ userId: string }> {
  const userId = crypto.randomUUID();
  await db.insert(schema.users).values({
    id: userId,
    email,
    password_hash: 'fakehash',
    password_salt: 'fakesalt',
    email_verified_at: null,
  });
  return { userId };
}

async function seedMagicToken(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email: string,
  options: { expiresOffset?: number; usedAt?: number } = {},
): Promise<{ raw: string; hash: string }> {
  const { raw, hash } = createEmailToken();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (options.expiresOffset ?? 15 * 60);

  await db.insert(schema.auth_tokens).values({
    token_hash: hash,
    email,
    kind: 'magic',
    expires_at: expiresAt,
    used_at: options.usedAt ?? null,
  });

  return { raw, hash };
}

async function seedVerifyToken(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email: string,
): Promise<{ raw: string; hash: string }> {
  const { raw, hash } = createEmailToken();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(schema.auth_tokens).values({
    token_hash: hash,
    email,
    kind: 'verify',
    expires_at: now + 60 * 60 * 24,
    used_at: null,
  });

  return { raw, hash };
}

// ---------------------------------------------------------------------------
// POST /api/auth/magic/request
// ---------------------------------------------------------------------------

describe('POST /api/auth/magic/request', () => {
  let ctx: SetupResult;

  beforeEach(async () => {
    ctx = await setup();
    vi.clearAllMocks();
  });

  // M3-T1: valid email for verified user → 200 neutral + 1 new auth_tokens row (kind='magic') + binding.send called
  it('M3-T1: verified user → 200 neutral, token row created (kind=magic, ~15min TTL), email sent', async () => {
    const email = 'verified@example.com';
    await seedVerifiedUser(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/request', { email }),
      asEnv(ctx.env),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/account exists/i);

    // Check DB row
    const tokenRows = await ctx.db
      .select()
      .from(schema.auth_tokens)
      .where(eq(schema.auth_tokens.email, email))
      .all();

    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0].kind).toBe('magic');
    expect(tokenRows[0].used_at).toBeNull();

    const now = Math.floor(Date.now() / 1000);
    const expectedExpiry = now + 15 * 60;
    // TTL should be within ~5 seconds of 15 minutes from now
    expect(tokenRows[0].expires_at).toBeGreaterThan(now);
    expect(tokenRows[0].expires_at!).toBeLessThanOrEqual(expectedExpiry + 5);

    // Email binding should have been called once
    expect(ctx.env.EMAIL.send).toHaveBeenCalledTimes(1);
  });

  // M3-T2: unknown email → same 200 neutral, 0 rows inserted, binding NOT called
  it('M3-T2: unknown email → 200 neutral, no DB row, binding NOT called, constant-time (within 100ms of verified path)', async () => {
    // Warm up: time for verified path
    const knownEmail = 'known@example.com';
    await seedVerifiedUser(ctx.db, knownEmail);

    const t1 = Date.now();
    await ctx.app.fetch(
      makePostRequest('/api/auth/magic/request', { email: knownEmail }),
      asEnv(ctx.env),
    );
    const knownElapsed = Date.now() - t1;

    // Reset mock so we can track calls for unknown email separately
    vi.clearAllMocks();

    const unknownEmail = 'nobody@example.com';
    const t2 = Date.now();
    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/request', { email: unknownEmail }),
      asEnv(ctx.env),
    );
    const unknownElapsed = Date.now() - t2;

    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/account exists/i);

    // No DB row
    const tokenRows = await ctx.db
      .select()
      .from(schema.auth_tokens)
      .where(eq(schema.auth_tokens.email, unknownEmail))
      .all();
    expect(tokenRows).toHaveLength(0);

    // Email binding NOT called
    expect(ctx.env.EMAIL.send).not.toHaveBeenCalled();

    // Timing: within 100ms of each other
    const timingDelta = Math.abs(knownElapsed - unknownElapsed);
    expect(timingDelta).toBeLessThan(100);
  });

  // M3-T3: unverified user → same neutral 200, no row inserted, binding NOT called
  it('M3-T3: unverified user → 200 neutral, no DB row, binding NOT called', async () => {
    const email = 'unverified@example.com';
    await seedUnverifiedUser(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/request', { email }),
      asEnv(ctx.env),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body.message).toMatch(/account exists/i);

    const tokenRows = await ctx.db
      .select()
      .from(schema.auth_tokens)
      .where(eq(schema.auth_tokens.email, email))
      .all();
    expect(tokenRows).toHaveLength(0);
    expect(ctx.env.EMAIL.send).not.toHaveBeenCalled();
  });

  // M3-T4: malformed email → 400 Zod error
  it('M3-T4: malformed email → 400 Zod validation error', async () => {
    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/request', { email: 'not-an-email' }),
      asEnv(ctx.env),
    );

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('validation_error');
  });

  // M3-T5: 6th request from same email → 429 (RL_LOGIN trips at 6th)
  it('M3-T5: 6th request from same email within 60s → 429', async () => {
    const email = 'ratelimited@example.com';
    await seedVerifiedUser(ctx.db, email);

    // First 5 succeed
    for (let i = 0; i < 5; i++) {
      await ctx.app.fetch(
        makePostRequest('/api/auth/magic/request', { email }),
        asEnv(ctx.env),
      );
    }

    // 6th: RL_LOGIN returns { success: false }
    (ctx.env.RL_LOGIN.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false });

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/request', { email }),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('too_many_attempts');
  });

  // M3-T6: 21st request from same IP → 429 (RL_LOGIN_IP trips at 21st)
  it('M3-T6: 21st request from same IP within 60s → 429', async () => {
    const email = 'ip-ratelimited@example.com';
    await seedVerifiedUser(ctx.db, email);

    // RL_LOGIN passes but RL_LOGIN_IP fails
    (ctx.env.RL_LOGIN_IP.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false });

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/request', { email }),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('too_many_attempts');
  });

  // M3-T7: Origin check → 403 (originCheck middleware guard)
  it('M3-T7: bad Origin header → 403 (originCheck guard)', async () => {
    const email = 'origin-check@example.com';
    await seedVerifiedUser(ctx.db, email);

    // Mount originCheck middleware on the test app
    const { d1, env } = createMockEnv();
    const db = drizzle(d1 as unknown as D1Database, { schema });
    const { originCheck } = await import('../../src/worker/middleware/origin-check');

    const guardedApp = new Hono<HonoEnv>();
    guardedApp.use(async (c, next) => {
      c.set('db', db);
      c.set('user', null);
      return next();
    });
    guardedApp.use('*', originCheck);
    guardedApp.route('/api/auth', authRouter);

    // Seed user in the guardedApp's DB
    await db.insert(schema.users).values({
      id: crypto.randomUUID(),
      email,
      password_hash: 'fakehash',
      password_salt: 'fakesalt',
      email_verified_at: Math.floor(Date.now() / 1000),
    });

    const res = await guardedApp.fetch(
      makePostRequest('/api/auth/magic/request', { email }, {
        Origin: 'https://evil.com',
      }),
      asEnv(env),
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/magic/consume
// ---------------------------------------------------------------------------

describe('POST /api/auth/magic/consume', () => {
  let ctx: SetupResult;

  beforeEach(async () => {
    ctx = await setup();
    vi.clearAllMocks();
  });

  // M3-T8: valid fresh token → 200, user JSON, Set-Cookie, used_at flipped, sessions row
  it('M3-T8: valid fresh token → 200 with user, __Host-session cookie, used_at flipped, sessions row', async () => {
    const email = 'consume-ok@example.com';
    const { userId } = await seedVerifiedUser(ctx.db, email);
    const { raw, hash } = await seedMagicToken(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/consume', { token: raw }),
      asEnv(ctx.env),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { user: { id: string; email: string } };
    expect(body.user).toBeTruthy();
    expect(body.user.email).toBe(email);

    // Session cookie set
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('__Host-session=');

    // used_at flipped on the auth_tokens row
    const tokenRow = await ctx.db
      .select()
      .from(schema.auth_tokens)
      .where(eq(schema.auth_tokens.token_hash, hash))
      .get();
    expect(tokenRow).toBeTruthy();
    expect(tokenRow!.used_at).toBeGreaterThan(0);

    // Session row exists for this user
    const sessionRows = await ctx.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.user_id, userId))
      .all();
    expect(sessionRows).toHaveLength(1);
  });

  // M3-T9: expired token → 400 neutral
  it('M3-T9: expired token → 400 "Link expired or already used"', async () => {
    const email = 'expired-magic@example.com';
    await seedVerifiedUser(ctx.db, email);
    const { raw } = await seedMagicToken(ctx.db, email, { expiresOffset: -60 });

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/consume', { token: raw }),
      asEnv(ctx.env),
    );

    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('Link expired or already used');
  });

  // M3-T10: already-used token → 400 neutral
  it('M3-T10: already-used token → 400 "Link expired or already used"', async () => {
    const email = 'used-magic@example.com';
    await seedVerifiedUser(ctx.db, email);
    const { raw } = await seedMagicToken(ctx.db, email, {
      usedAt: Math.floor(Date.now() / 1000) - 100,
    });

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/consume', { token: raw }),
      asEnv(ctx.env),
    );

    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('Link expired or already used');
  });

  // M3-T11: cross-kind — pass a 'verify' token → 400 neutral (CAS filters by kind='magic')
  it('M3-T11: cross-kind verify token → 400 (CAS filters kind=magic)', async () => {
    const email = 'cross-kind@example.com';
    await seedVerifiedUser(ctx.db, email);
    // Seed a verify-kind token (NOT magic)
    const { raw } = await seedVerifyToken(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/consume', { token: raw }),
      asEnv(ctx.env),
    );

    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('Link expired or already used');
  });

  // M3-T12: garbage hex token → 400 neutral
  it('M3-T12: garbage token → 400 "Link expired or already used"', async () => {
    const garbage = 'aabbccdd1122334455667788aabbccdd'; // 32 chars, valid length but no matching row

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/consume', { token: garbage }),
      asEnv(ctx.env),
    );

    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('Link expired or already used');
  });

  // M3-T13: missing token field → 400 Zod error
  it('M3-T13: missing token field → 400 Zod validation error', async () => {
    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/magic/consume', {}),
      asEnv(ctx.env),
    );

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('validation_error');
  });
});
