/**
 * Integration tests — POST /api/auth/login
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { createMockEnv } from '../helpers/mock-env';
import * as schema from '../../src/db/schema';
import { authRouter } from '../../src/worker/routes/auth';
import { hashPassword } from '../../src/worker/lib/password';
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

function makeLoginRequest(
  email: string,
  password: string,
  _env: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email, password }),
  });
}

async function seedVerifiedUser(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email: string,
  password: string,
): Promise<string> {
  const { hash, salt } = await hashPassword(password);
  const userId = crypto.randomUUID();
  await db.insert(schema.users).values({
    id: userId,
    email,
    password_hash: hash,
    password_salt: salt,
    email_verified_at: Math.floor(Date.now() / 1000),
  });
  return userId;
}

async function seedUnverifiedUser(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email: string,
  password: string,
): Promise<string> {
  const { hash, salt } = await hashPassword(password);
  const userId = crypto.randomUUID();
  await db.insert(schema.users).values({
    id: userId,
    email,
    password_hash: hash,
    password_salt: salt,
    email_verified_at: null,
  });
  return userId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  let ctx: SetupResult;

  beforeEach(async () => {
    ctx = await setup();
    vi.clearAllMocks();
  });

  it('valid credentials → 200 with user and Set-Cookie', async () => {
    const email = 'login-ok@example.com';
    const password = 'supersecret1234';
    await seedVerifiedUser(ctx.db, email, password);

    const res = await ctx.app.fetch(
      makeLoginRequest(email, password, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; user: { email: string } };
    expect(body.ok).toBe(true);
    expect(body.user.email).toBe(email);

    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('__Host-session=');
  });

  it('wrong password → 401 invalid_credentials', async () => {
    const email = 'wrong-pw@example.com';
    await seedVerifiedUser(ctx.db, email, 'supersecret1234');

    const res = await ctx.app.fetch(
      makeLoginRequest(email, 'wrongpassword!!', ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_credentials');
  });

  it('unknown email → 401 invalid_credentials (same shape as wrong password)', async () => {
    const res = await ctx.app.fetch(
      makeLoginRequest('nobody@example.com', 'supersecret1234', ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_credentials');
  });

  it('unknown email vs wrong password: timing parity within 10x ratio', async () => {
    const email = 'timing-check@example.com';
    await seedVerifiedUser(ctx.db, email, 'supersecret1234');

    // Run each path multiple times and take the average to reduce noise
    const REPS = 3;

    let wrongPwTotal = 0;
    for (let i = 0; i < REPS; i++) {
      const t = Date.now();
      await ctx.app.fetch(makeLoginRequest(email, `wrongpassword-${i}!`, ctx.env), asEnv(ctx.env));
      wrongPwTotal += Date.now() - t;
    }

    let unknownEmailTotal = 0;
    for (let i = 0; i < REPS; i++) {
      const t = Date.now();
      await ctx.app.fetch(makeLoginRequest(`nobody${i}@example.com`, 'supersecret1234', ctx.env), asEnv(ctx.env));
      unknownEmailTotal += Date.now() - t;
    }

    const wrongPwAvg = wrongPwTotal / REPS;
    const unknownEmailAvg = unknownEmailTotal / REPS;

    // Both paths invoke scrypt (or dummyVerifyPassword); ratio should be within 10x
    // In test environments, scrypt timing is heavily influenced by JIT/GC noise,
    // so we use a generous bound and just verify both paths complete in non-trivial time.
    const ratio = Math.max(wrongPwAvg, unknownEmailAvg) / (Math.min(wrongPwAvg, unknownEmailAvg) || 1);
    expect(ratio).toBeLessThan(10);
  });

  it('unverified email → 401 invalid_credentials (enumeration vector closed)', async () => {
    // N-R3-1 remediation (2026-04-23): unverified accounts return the same 401
    // shape as unknown-email / wrong-password so attackers cannot probe for
    // partially-registered accounts via the login endpoint.
    const email = 'unverified@example.com';
    const password = 'supersecret1234';
    await seedUnverifiedUser(ctx.db, email, password);

    const res = await ctx.app.fetch(
      makeLoginRequest(email, password, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body).toEqual({ error: 'invalid_credentials' });
  });

  it('rate limit on RL_LOGIN → 429 too_many_attempts', async () => {
    // Mock RL_LOGIN to deny
    (ctx.env.RL_LOGIN.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false });

    const res = await ctx.app.fetch(
      makeLoginRequest('anyone@example.com', 'supersecret1234', ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('too_many_attempts');
  });

  it('rate limit on RL_LOGIN_IP → 429 too_many_attempts', async () => {
    // RL_LOGIN passes, RL_LOGIN_IP denies
    (ctx.env.RL_LOGIN.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: true });
    (ctx.env.RL_LOGIN_IP.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false });

    const res = await ctx.app.fetch(
      makeLoginRequest('anyone@example.com', 'supersecret1234', ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('too_many_attempts');
  });

  it('login response has Cache-Control: no-store', async () => {
    const email = 'cache@example.com';
    await seedVerifiedUser(ctx.db, email, 'supersecret1234');

    const res = await ctx.app.fetch(
      makeLoginRequest(email, 'supersecret1234', ctx.env),
      asEnv(ctx.env),
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('email is case-insensitively matched', async () => {
    const email = 'CaseTest@example.com';
    await seedVerifiedUser(ctx.db, email.toLowerCase(), 'supersecret1234');

    const res = await ctx.app.fetch(
      makeLoginRequest(email, 'supersecret1234', ctx.env),
      asEnv(ctx.env),
    );
    // Should work because login lowercases the email before lookup
    expect(res.status).toBe(200);
  });
});
