/**
 * Adversarial security tests — Round 3 review.
 *
 * These tests validate the Phase 3 threat matrix from instruction/work/plan.md §Security.
 * Each test documents the attack scenario and the expected defensive outcome.
 *
 * Scope:
 *   - Login brute force (RL_LOGIN + RL_LOGIN_IP)
 *   - Email enumeration on signup/login/request-reset
 *   - Tree enumeration (404-always for non-access)
 *   - CSRF posture for JSON POSTs (Hono csrf quirk)
 *   - Edge cache behaviour on visibility transitions
 *   - Session fixation / rotation
 *   - Session leakage across cookie tampering
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { createMockEnv } from '../helpers/mock-env';
import * as schema from '../../src/db/schema';
import { authRouter } from '../../src/worker/routes/auth';
import { sharesRouter } from '../../src/worker/routes/shares';
import { treeRouter } from '../../src/worker/routes/tree';
import { sessionMiddleware } from '../../src/worker/middleware/session';
import { originCheck } from '../../src/worker/middleware/origin-check';
import { hashPassword } from '../../src/worker/lib/password';
import { hashToken } from '../../src/worker/lib/tokens';
import type { HonoEnv } from '../../src/worker/types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface SetupResult {
  app: Hono<HonoEnv>;
  db: ReturnType<typeof drizzle<typeof schema>>;
  d1: SqliteD1Database;
  env: ReturnType<typeof createMockEnv>['env'];
}

/**
 * Standard auth-router app, similar to the auth-*.test.ts harness. c.var.user
 * is left null so /me behaves as anonymous; login/signup still work.
 *
 * Includes the global `originCheck` middleware so CSRF behaviour matches
 * production (N-R3-2 remediation).
 */
async function setupAuthApp(): Promise<SetupResult> {
  const { d1, env } = createMockEnv();
  const db = drizzle(d1 as unknown as D1Database, { schema });

  const app = new Hono<HonoEnv>();
  app.use(async (c, next) => {
    c.set('db', db);
    c.set('user', null);
    return next();
  });
  app.use('*', originCheck);
  app.route('/api/auth', authRouter);

  return { app, db, d1, env };
}

function jsonPost(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function formPost(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const asEnv = (e: SetupResult['env']) => e as unknown as Record<string, unknown>;

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

// ===========================================================================
// 1. Login brute force — rate limit exhaustion
// ===========================================================================

describe('adversarial — login rate limiting', () => {
  test('RL_LOGIN exhaustion: 6th attempt for same email returns 429', async () => {
    const ctx = await setupAuthApp();
    await seedVerifiedUser(ctx.db, 'victim@example.com', 'correctpass1234');

    // Simulate real rate-limit behavior: 5 successes, 6th fails
    let calls = 0;
    (ctx.env.RL_LOGIN.limit as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls += 1;
      return { success: calls <= 5 };
    });

    let lastStatus = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await ctx.app.fetch(
        jsonPost('/api/auth/login', { email: 'victim@example.com', password: `wrong-${i}` }),
        asEnv(ctx.env),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  test('rate limit is applied BEFORE password hashing (no scrypt on denied attempts)', async () => {
    const ctx = await setupAuthApp();
    // All RL calls deny
    (ctx.env.RL_LOGIN.limit as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false });

    const t = Date.now();
    const res = await ctx.app.fetch(
      jsonPost('/api/auth/login', {
        email: 'any@example.com',
        password: 'anything123456',
      }),
      asEnv(ctx.env),
    );
    const elapsed = Date.now() - t;
    expect(res.status).toBe(429);
    // scrypt with N=16384 takes ~20-100ms; a rate-limited no-op should finish in <15ms
    // We accept up to 50ms to account for test-harness jitter.
    expect(elapsed).toBeLessThan(50);
  });

  test('RL_LOGIN keyed by normalized lowercase email', async () => {
    const ctx = await setupAuthApp();
    const calls: string[] = [];
    (ctx.env.RL_LOGIN.limit as ReturnType<typeof vi.fn>).mockImplementation(
      async (opts: { key: string }) => {
        calls.push(opts.key);
        return { success: true };
      },
    );

    await ctx.app.fetch(
      jsonPost('/api/auth/login', { email: 'MiXeD@EXAMPLE.com', password: 'xxx123456789' }),
      asEnv(ctx.env),
    );
    expect(calls[0]).toBe('mixed@example.com');
  });

  test('RL_LOGIN_IP keyed by CF-Connecting-IP header, never x-forwarded-for', async () => {
    const ctx = await setupAuthApp();
    const ipCalls: string[] = [];
    (ctx.env.RL_LOGIN_IP.limit as ReturnType<typeof vi.fn>).mockImplementation(
      async (opts: { key: string }) => {
        ipCalls.push(opts.key);
        return { success: true };
      },
    );

    // A spoofed X-Forwarded-For header must NOT influence the bucket.
    await ctx.app.fetch(
      jsonPost('/api/auth/login', { email: 'x@y.com', password: 'xxxxxxxxxxxx' }, {
        'CF-Connecting-IP': '1.2.3.4',
        'X-Forwarded-For': '9.9.9.9',
      }),
      asEnv(ctx.env),
    );
    expect(ipCalls[0]).toBe('1.2.3.4');
  });
});

// ===========================================================================
// 2. Email enumeration on signup / login / request-reset
// ===========================================================================

describe('adversarial — email enumeration', () => {
  test('signup: same email twice returns identical body shape + status', async () => {
    const ctx = await setupAuthApp();
    const r1 = await ctx.app.fetch(
      jsonPost('/api/auth/signup', { email: 'enum@example.com', password: 'supersecret1234' }),
      asEnv(ctx.env),
    );
    const r2 = await ctx.app.fetch(
      jsonPost('/api/auth/signup', { email: 'enum@example.com', password: 'supersecret1234' }),
      asEnv(ctx.env),
    );

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1).toEqual({ ok: true });
    expect(b2).toEqual({ ok: true });
  });

  test('signup: existing verified email returns 201 (silent, no email sent)', async () => {
    const ctx = await setupAuthApp();
    await seedVerifiedUser(ctx.db, 'verified@example.com', 'oldpass12345');
    vi.clearAllMocks();

    const res = await ctx.app.fetch(
      jsonPost('/api/auth/signup', { email: 'verified@example.com', password: 'newpassword1234' }),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    // Critical: no email is sent to the verified address (preventing enumeration + protection against bomb-spam)
    expect(ctx.env.EMAIL.send).not.toHaveBeenCalled();
  });

  test('login: unknown email vs wrong password return identical response shape', async () => {
    const ctx = await setupAuthApp();
    await seedVerifiedUser(ctx.db, 'known@example.com', 'correctpw1234');

    const unknown = await ctx.app.fetch(
      jsonPost('/api/auth/login', { email: 'unknown@example.com', password: 'anything1234' }),
      asEnv(ctx.env),
    );
    const wrongPw = await ctx.app.fetch(
      jsonPost('/api/auth/login', { email: 'known@example.com', password: 'wrongpass1234' }),
      asEnv(ctx.env),
    );

    expect(unknown.status).toBe(wrongPw.status);
    expect(unknown.status).toBe(401);

    const b1 = (await unknown.json()) as { error: string };
    const b2 = (await wrongPw.json()) as { error: string };
    expect(b1).toEqual({ error: 'invalid_credentials' });
    expect(b2).toEqual({ error: 'invalid_credentials' });
  });

  test('login: unverified-email user returns IDENTICAL shape (401) — enumeration closed', async () => {
    // N-R3-1 remediation (2026-04-23): unverified-account login now returns the
    // same 401 invalid_credentials surface as unknown-email / wrong-password.
    // The enumeration vector that previously distinguished "partially registered"
    // from "no account at all" is closed. scrypt still runs on this path for
    // timing parity.
    const ctx = await setupAuthApp();
    await seedUnverifiedUser(ctx.db, 'unverified@example.com', 'correctpw1234');

    const unverified = await ctx.app.fetch(
      jsonPost('/api/auth/login', { email: 'unverified@example.com', password: 'correctpw1234' }),
      asEnv(ctx.env),
    );
    const unknown = await ctx.app.fetch(
      jsonPost('/api/auth/login', { email: 'nobody@example.com', password: 'correctpw1234' }),
      asEnv(ctx.env),
    );

    // Same status and same body shape on both paths.
    expect(unverified.status).toBe(401);
    expect(unknown.status).toBe(401);
    const u = (await unverified.json()) as { error: string };
    const k = (await unknown.json()) as { error: string };
    expect(u).toEqual({ error: 'invalid_credentials' });
    expect(k).toEqual({ error: 'invalid_credentials' });
  });

  test('request-reset: known + unknown + rate-limited email ALL return 204', async () => {
    const ctx = await setupAuthApp();
    await seedVerifiedUser(ctx.db, 'present@example.com', 'anypw12345678');

    const known = await ctx.app.fetch(
      jsonPost('/api/auth/request-reset', { email: 'present@example.com' }),
      asEnv(ctx.env),
    );
    const unknown = await ctx.app.fetch(
      jsonPost('/api/auth/request-reset', { email: 'ghost@example.com' }),
      asEnv(ctx.env),
    );

    expect(known.status).toBe(204);
    expect(unknown.status).toBe(204);

    // Rate-limit path also returns 204
    (ctx.env.RL_LOGIN.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false });
    const rl = await ctx.app.fetch(
      jsonPost('/api/auth/request-reset', { email: 'present@example.com' }),
      asEnv(ctx.env),
    );
    expect(rl.status).toBe(204);
  });

  test('request-reset: malformed body still returns 204 (no leak)', async () => {
    const ctx = await setupAuthApp();

    // Invalid email format
    const invalid = await ctx.app.fetch(
      jsonPost('/api/auth/request-reset', { email: 'not-an-email' }),
      asEnv(ctx.env),
    );
    expect(invalid.status).toBe(204);

    // Invalid JSON
    const badJson = await ctx.app.fetch(
      new Request('http://localhost/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{{{invalid',
      }),
      asEnv(ctx.env),
    );
    expect(badJson.status).toBe(204);
  });
});

// ===========================================================================
// 3. Timing parity
// ===========================================================================

describe('adversarial — login timing parity', () => {
  test('unknown-email and wrong-password paths both invoke scrypt (latency ratio < 5x)', async () => {
    const ctx = await setupAuthApp();
    await seedVerifiedUser(ctx.db, 'timer@example.com', 'correctpw1234');

    const REPS = 3;
    let unknownTotal = 0;
    let wrongTotal = 0;

    // Warm up JIT
    await ctx.app.fetch(
      jsonPost('/api/auth/login', { email: 'warmup@example.com', password: 'x'.repeat(16) }),
      asEnv(ctx.env),
    );
    await ctx.app.fetch(
      jsonPost('/api/auth/login', { email: 'timer@example.com', password: 'warmup123456' }),
      asEnv(ctx.env),
    );

    for (let i = 0; i < REPS; i += 1) {
      const t0 = Date.now();
      await ctx.app.fetch(
        jsonPost('/api/auth/login', { email: `nobody${i}@example.com`, password: 'xxxxxxxxxxxx' }),
        asEnv(ctx.env),
      );
      unknownTotal += Date.now() - t0;

      const t1 = Date.now();
      await ctx.app.fetch(
        jsonPost('/api/auth/login', { email: 'timer@example.com', password: `wrong-${i}xxxxx` }),
        asEnv(ctx.env),
      );
      wrongTotal += Date.now() - t1;
    }

    const unknownAvg = unknownTotal / REPS;
    const wrongAvg = wrongTotal / REPS;
    const ratio = Math.max(unknownAvg, wrongAvg) / Math.max(Math.min(unknownAvg, wrongAvg), 1);
    // Both paths run scrypt — ratio should be < 5x even under test-harness jitter.
    expect(ratio).toBeLessThan(5);
  });
});

// ===========================================================================
// 4. CSRF posture — originCheck middleware covers ALL mutation content-types
// ===========================================================================

describe('originCheck — CSRF defense-in-depth (N-R3-2 remediation)', () => {
  test('forged Origin + application/json POST IS blocked by originCheck', async () => {
    // Before N-R3-2 remediation, hono/csrf did not inspect application/json,
    // leaving JSON POSTs to rely on implicit browser defences (SameSite + CORS
    // preflight). The new originCheck middleware inspects every mutation
    // method regardless of Content-Type and returns 403 forbidden_origin on
    // cross-origin POSTs.
    const ctx = await setupAuthApp();

    const res = await ctx.app.fetch(
      jsonPost(
        '/api/auth/login',
        { email: 'x@y.com', password: 'xxxxxxxxxxxx' },
        { Origin: 'https://evil.example' },
      ),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body).toEqual({ error: 'forbidden_origin' });
  });

  test('forged Origin + x-www-form-urlencoded POST IS blocked', async () => {
    const ctx = await setupAuthApp();

    const res = await ctx.app.fetch(
      formPost(
        '/api/auth/login',
        'email=x@y.com&password=xxxxxxxxxxxx',
        { Origin: 'https://evil.example' },
      ),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(403);
  });

  test('forged Origin + text/plain POST IS blocked', async () => {
    const ctx = await setupAuthApp();

    const res = await ctx.app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.example' },
        body: JSON.stringify({ email: 'x@y.com', password: 'xxxxxxxxxxxx' }),
      }),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(403);
  });

  test('GET with forged Origin is NOT blocked (middleware is method-scoped)', async () => {
    // Read-only traffic is not a CSRF target, so originCheck must only act on
    // mutation methods. A forged Origin on GET must ride through.
    const ctx = await setupAuthApp();

    const res = await ctx.app.fetch(
      new Request('http://localhost/api/auth/me', {
        method: 'GET',
        headers: { Origin: 'https://evil.example' },
      }),
      asEnv(ctx.env),
    );
    // /me returns 401 (no session) — critically, NOT 403 forbidden_origin.
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(403);
  });

  test('missing Origin on mutation ride-through (curl / tooling compat)', async () => {
    // Browsers always set Origin on cross-origin fetch POSTs, so absence
    // implies same-origin or non-browser tooling. Must not block.
    const ctx = await setupAuthApp();

    const res = await ctx.app.fetch(
      jsonPost('/api/auth/login', { email: 'x@y.com', password: 'xxxxxxxxxxxx' }),
      asEnv(ctx.env),
    );
    // 401 invalid_credentials (unknown email) — the request wasn't blocked by origin.
    expect(res.status).toBe(401);
  });

  test('matching Origin passes through', async () => {
    const ctx = await setupAuthApp();

    const res = await ctx.app.fetch(
      jsonPost(
        '/api/auth/login',
        { email: 'x@y.com', password: 'xxxxxxxxxxxx' },
        // createMockEnv defaults APP_URL to http://localhost:5173
        { Origin: 'http://localhost:5173' },
      ),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ===========================================================================
// 5. Tree enumeration — always 404 for no-access
// ===========================================================================

describe('adversarial — tree enumeration returns 404 always', () => {
  async function setupTreeApp(user: { id: string; email: string } | null) {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });
    const app = new Hono<HonoEnv>();
    app.use(async (c, next) => {
      c.set('db', db);
      c.set('user', user ? { ...user, email_verified_at: 1 } : null);
      return next();
    });
    app.route('/api/tree', treeRouter);
    return { app, db, d1 };
  }

  function seedPrivate(
    db: ReturnType<typeof drizzle<typeof schema>>,
    ownerId: string,
    slug: string,
  ) {
    return db.insert(schema.trees).values({
      id: `tree-${slug}`,
      slug,
      name: 'Private',
      owner_id: ownerId,
      visibility: 'private',
    });
  }

  function seedShared(
    db: ReturnType<typeof drizzle<typeof schema>>,
    ownerId: string,
    slug: string,
  ) {
    return db.insert(schema.trees).values({
      id: `tree-${slug}`,
      slug,
      name: 'Shared',
      owner_id: ownerId,
      visibility: 'shared',
    });
  }

  test('anonymous GET of private tree → 404 (not 401/403)', async () => {
    const { app, db } = await setupTreeApp(null);
    await db.insert(schema.users).values({ id: 'owner1', email: 'o@x.com' });
    await seedPrivate(db, 'owner1', 'secret-tree');

    const res = await app.fetch(
      new Request('http://localhost/api/tree/secret-tree', { method: 'GET' }),
    );
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  test('stranger (authed but not shared) GET of private tree → 404', async () => {
    const { app, db } = await setupTreeApp({ id: 'stranger', email: 's@x.com' });
    await db.insert(schema.users).values({ id: 'owner1', email: 'o@x.com' });
    await db.insert(schema.users).values({ id: 'stranger', email: 's@x.com' });
    await seedPrivate(db, 'owner1', 'private-tree');

    const res = await app.fetch(
      new Request('http://localhost/api/tree/private-tree', { method: 'GET' }),
    );
    expect(res.status).toBe(404);
  });

  test('stranger (authed, no accepted share) GET of shared tree → 404', async () => {
    const { app, db } = await setupTreeApp({ id: 'stranger', email: 's@x.com' });
    await db.insert(schema.users).values({ id: 'owner1', email: 'o@x.com' });
    await db.insert(schema.users).values({ id: 'stranger', email: 's@x.com' });
    await seedShared(db, 'owner1', 'shared-tree');

    const res = await app.fetch(
      new Request('http://localhost/api/tree/shared-tree', { method: 'GET' }),
    );
    expect(res.status).toBe(404);
  });

  test('stranger (authed, PENDING share only) GET of shared tree → 404', async () => {
    const { app, db } = await setupTreeApp({ id: 'stranger', email: 's@x.com' });
    await db.insert(schema.users).values({ id: 'owner1', email: 'o@x.com' });
    await db.insert(schema.users).values({
      id: 'stranger',
      email: 's@x.com',
      email_verified_at: 1,
    });
    await seedShared(db, 'owner1', 'shared-pending');
    await db.insert(schema.tree_shares).values({
      id: 'share-pending',
      tree_id: 'tree-shared-pending',
      email: 's@x.com',
      user_id: 'stranger',
      status: 'pending',
      invited_by: 'owner1',
      role: 'viewer',
    });

    const res = await app.fetch(
      new Request('http://localhost/api/tree/shared-pending', { method: 'GET' }),
    );
    expect(res.status).toBe(404);
  });

  test('anonymous GET of non-existent slug → 404 indistinguishable from private-tree 404', async () => {
    const { app } = await setupTreeApp(null);

    const res = await app.fetch(
      new Request('http://localhost/api/tree/no-such-tree-exists', { method: 'GET' }),
    );
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// 6. Edge-cache visibility: session cookie bypasses cache
// ===========================================================================

describe('adversarial — edge cache on /api/tree/:slug', () => {
  async function setupTreeApp(user: { id: string; email: string } | null) {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });
    const app = new Hono<HonoEnv>();
    app.use(async (c, next) => {
      c.set('db', db);
      c.set('user', user ? { ...user, email_verified_at: 1 } : null);
      return next();
    });
    app.route('/api/tree', treeRouter);
    return { app, db, d1 };
  }

  test('public tree + session cookie → Cache-Control: private, no-store (no cache read)', async () => {
    const { app, db } = await setupTreeApp({ id: 'u1', email: 'u1@x.com' });
    await db.insert(schema.users).values({ id: 'u1', email: 'u1@x.com' });
    await db.insert(schema.trees).values({
      id: 'tree-pub',
      slug: 'pub-tree',
      name: 'Pub',
      owner_id: 'u1',
      visibility: 'public',
    });

    const res = await app.fetch(
      new Request('http://localhost/api/tree/pub-tree', {
        method: 'GET',
        headers: { Cookie: '__Host-session=abc123def456' },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

// ===========================================================================
// 7. Session fixation / invalidation
// ===========================================================================

describe('adversarial — session fixation + invalidation', () => {
  test('login issues FRESH token; pre-set cookie value does NOT become the session key', async () => {
    const ctx = await setupAuthApp();
    const attackerFixedToken = 'attacker-chosen-token-xyz-1234';
    await seedVerifiedUser(ctx.db, 'fix@example.com', 'correctpw1234');

    const res = await ctx.app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Attacker pre-set the cookie in the victim's browser via (e.g.) subdomain vulnerability
          Cookie: `__Host-session=${attackerFixedToken}`,
        },
        body: JSON.stringify({ email: 'fix@example.com', password: 'correctpw1234' }),
      }),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(200);

    // Server issued a Set-Cookie with a fresh value — NOT the attacker's.
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/__Host-session=/);
    expect(setCookie).not.toContain(attackerFixedToken);

    // And the attacker's token hash must NOT exist as a session row.
    const attackerSession = await ctx.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.token_hash, hashToken(attackerFixedToken)))
      .get();
    expect(attackerSession).toBeUndefined();
  });

  test('reset-password invalidates ALL sessions for the user', async () => {
    const ctx = await setupAuthApp();
    const userId = await seedVerifiedUser(ctx.db, 'reset-all@example.com', 'oldpass12345');

    // Seed 3 separate sessions for this user
    for (const sid of ['s1', 's2', 's3']) {
      await ctx.db.insert(schema.sessions).values({
        id: sid,
        token_hash: hashToken(`raw-${sid}`),
        user_id: userId,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
    }

    // Create a reset token for this user
    const { createEmailToken } = await import('../../src/worker/lib/tokens');
    const { raw, hash } = createEmailToken();
    await ctx.db.insert(schema.auth_tokens).values({
      token_hash: hash,
      email: 'reset-all@example.com',
      kind: 'reset',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });

    const res = await ctx.app.fetch(
      jsonPost('/api/auth/reset', { token: raw, newPassword: 'freshpassword1234' }),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(204);

    const leftover = await ctx.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.user_id, userId));
    expect(leftover).toHaveLength(0);
  });

  test('logout only deletes the current session; other sessions remain valid', async () => {
    const ctx = await setupAuthApp();
    const userId = await seedVerifiedUser(ctx.db, 'multi@example.com', 'x'.repeat(16));

    // Sessions A and B for the same user
    for (const sid of ['sA', 'sB']) {
      await ctx.db.insert(schema.sessions).values({
        id: sid,
        token_hash: hashToken(`raw-${sid}`),
        user_id: userId,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
    }

    // Logout with session A's cookie
    const res = await ctx.app.fetch(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: '__Host-session=raw-sA' },
        body: '{}',
      }),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(204);

    // Only B remains
    const remaining = await ctx.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.user_id, userId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('sB');
  });
});

// ===========================================================================
// 8. Cookie flags
// ===========================================================================

describe('adversarial — session cookie flags', () => {
  test('login Set-Cookie has __Host- prefix + HttpOnly + Secure + SameSite=Lax + Path=/', async () => {
    const ctx = await setupAuthApp();
    await seedVerifiedUser(ctx.db, 'cookie@example.com', 'correctpw1234');

    const res = await ctx.app.fetch(
      jsonPost('/api/auth/login', {
        email: 'cookie@example.com',
        password: 'correctpw1234',
      }),
      asEnv(ctx.env),
    );
    const sc = res.headers.get('Set-Cookie') ?? '';
    expect(sc).toMatch(/__Host-session=/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/Secure/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Path=\//);
    // __Host- prefix forbids Domain attribute; verify absent.
    expect(sc).not.toMatch(/Domain=/i);
  });

  test('verify Set-Cookie has identical flag set', async () => {
    const ctx = await setupAuthApp();
    await ctx.db.insert(schema.users).values({
      id: crypto.randomUUID(),
      email: 'vcookie@example.com',
      password_hash: 'x',
      password_salt: 'y',
    });
    const { createEmailToken } = await import('../../src/worker/lib/tokens');
    const { raw, hash } = createEmailToken();
    await ctx.db.insert(schema.auth_tokens).values({
      token_hash: hash,
      email: 'vcookie@example.com',
      kind: 'verify',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });

    const res = await ctx.app.fetch(
      jsonPost('/api/auth/verify', { token: raw }),
      asEnv(ctx.env),
    );
    const sc = res.headers.get('Set-Cookie') ?? '';
    expect(sc).toMatch(/__Host-session=/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/Secure/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Path=\//);
    expect(sc).not.toMatch(/Domain=/i);
  });
});
