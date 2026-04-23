/**
 * Integration tests — POST /api/auth/request-reset and POST /api/auth/reset
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { createMockEnv } from '../helpers/mock-env';
import * as schema from '../../src/db/schema';
import { authRouter } from '../../src/worker/routes/auth';
import { createEmailToken, hashToken } from '../../src/worker/lib/tokens';
import { hashPassword, verifyPassword } from '../../src/worker/lib/password';
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

function makePostRequest(path: string, body: unknown, _env: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function seedUser(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email: string,
  password?: string,
): Promise<string> {
  const userId = crypto.randomUUID();
  let hash: string | undefined;
  let salt: string | undefined;
  if (password) {
    const pw = await hashPassword(password);
    hash = pw.hash;
    salt = pw.salt;
  }
  await db.insert(schema.users).values({
    id: userId,
    email,
    password_hash: hash,
    password_salt: salt,
    email_verified_at: Math.floor(Date.now() / 1000),
  });
  return userId;
}

async function seedResetToken(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email: string,
  options: { expiresOffset?: number } = {},
): Promise<{ raw: string; hash: string }> {
  const { raw, hash } = createEmailToken();
  const now = Math.floor(Date.now() / 1000);
  await db.insert(schema.auth_tokens).values({
    token_hash: hash,
    email,
    kind: 'reset',
    expires_at: now + (options.expiresOffset ?? 3600),
  });
  return { raw, hash };
}

// ---------------------------------------------------------------------------
// Tests: /request-reset
// ---------------------------------------------------------------------------

describe('POST /api/auth/request-reset', () => {
  let ctx: SetupResult;

  beforeEach(async () => {
    ctx = await setup();
    vi.clearAllMocks();
  });

  it('known email → 204 and email sent with reset token', async () => {
    const email = 'reset-me@example.com';
    await seedUser(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/request-reset', { email }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(204);

    // Email should have been sent
    expect(ctx.env.EMAIL.send).toHaveBeenCalledOnce();
    const call = (ctx.env.EMAIL.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.to).toBe(email);

    // auth_tokens row should exist
    const token = await ctx.db
      .select()
      .from(schema.auth_tokens)
      .where(
        and(
          eq(schema.auth_tokens.email, email),
          eq(schema.auth_tokens.kind, 'reset'),
        ),
      )
      .get();
    expect(token).toBeDefined();
    expect(token!.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('unknown email → 204, no email sent, no token created', async () => {
    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/request-reset', { email: 'nobody@example.com' }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(204);
    expect(ctx.env.EMAIL.send).not.toHaveBeenCalled();

    const token = await ctx.db
      .select()
      .from(schema.auth_tokens)
      .where(eq(schema.auth_tokens.email, 'nobody@example.com'))
      .get();
    expect(token).toBeUndefined();
  });

  it('always returns 204 — never reveals email existence', async () => {
    // Known email
    await seedUser(ctx.db, 'known@example.com');
    const r1 = await ctx.app.fetch(
      makePostRequest('/api/auth/request-reset', { email: 'known@example.com' }, ctx.env),
      asEnv(ctx.env),
    );
    // Unknown email
    const r2 = await ctx.app.fetch(
      makePostRequest('/api/auth/request-reset', { email: 'unknown@example.com' }, ctx.env),
      asEnv(ctx.env),
    );

    expect(r1.status).toBe(204);
    expect(r2.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Tests: /reset
// ---------------------------------------------------------------------------

describe('POST /api/auth/reset', () => {
  let ctx: SetupResult;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('valid token → 204 and password updated', async () => {
    const email = 'pw-reset@example.com';
    await seedUser(ctx.db, email, 'oldpassword1234');
    const { raw } = await seedResetToken(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/reset', { token: raw, newPassword: 'newpassword5678' }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(204);

    // Verify new password works
    const user = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .get();
    expect(user!.password_hash).toBeTruthy();
    const valid = await verifyPassword('newpassword5678', user!.password_hash!, user!.password_salt!);
    expect(valid).toBe(true);
    const oldValid = await verifyPassword('oldpassword1234', user!.password_hash!, user!.password_salt!);
    expect(oldValid).toBe(false);
  });

  it('valid token → ALL user sessions deleted', async () => {
    const email = 'session-purge@example.com';
    const userId = await seedUser(ctx.db, email, 'oldpassword1234');

    // Seed two sessions for this user
    for (const sid of ['sess1', 'sess2']) {
      await ctx.db.insert(schema.sessions).values({
        id: sid,
        token_hash: hashToken(`raw-token-${sid}`),
        user_id: userId,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
    }

    const { raw } = await seedResetToken(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/reset', { token: raw, newPassword: 'newpassword5678' }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(204);

    // Both sessions should be gone
    const remaining = await ctx.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.user_id, userId));
    expect(remaining).toHaveLength(0);
  });

  it('expired token → 410', async () => {
    const email = 'expired-reset@example.com';
    await seedUser(ctx.db, email);
    const { raw } = await seedResetToken(ctx.db, email, { expiresOffset: -60 }); // already expired

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/reset', { token: raw, newPassword: 'newpassword5678' }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(410);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_or_expired');
  });

  it('used token → 410', async () => {
    const email = 'used-reset@example.com';
    await seedUser(ctx.db, email);
    const { raw } = await seedResetToken(ctx.db, email);

    // Use it once
    await ctx.app.fetch(
      makePostRequest('/api/auth/reset', { token: raw, newPassword: 'newpassword5678' }, ctx.env),
      asEnv(ctx.env),
    );

    // Try to use it again
    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/reset', { token: raw, newPassword: 'anotherpassword9012' }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(410);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_or_expired');
  });

  it('newPassword shorter than 12 chars → 422', async () => {
    const email = 'short-pw@example.com';
    await seedUser(ctx.db, email);
    const { raw } = await seedResetToken(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/reset', { token: raw, newPassword: 'tooshort' }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(422);
  });

  it('wrong/unknown token → 410', async () => {
    const res = await ctx.app.fetch(
      makePostRequest(
        '/api/auth/reset',
        { token: 'completely-unknown-token-xyz', newPassword: 'newpassword5678' },
        ctx.env,
      ),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(410);
  });
});
