/**
 * Integration tests — POST /api/auth/verify
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { createMockEnv } from '../helpers/mock-env';
import * as schema from '../../src/db/schema';
import { authRouter } from '../../src/worker/routes/auth';
import { createEmailToken } from '../../src/worker/lib/tokens';
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

// ---------------------------------------------------------------------------
// Helpers to seed test data
// ---------------------------------------------------------------------------

async function seedUnverifiedUser(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email = 'verify-me@example.com',
): Promise<{ userId: string }> {
  const userId = crypto.randomUUID();
  await db.insert(schema.users).values({
    id: userId,
    email,
    password_hash: 'fakehash',
    password_salt: 'fakesalt',
  });
  return { userId };
}

async function seedVerifyToken(
  db: ReturnType<typeof drizzle<typeof schema>>,
  email: string,
  options: { expiresOffset?: number; usedAt?: number } = {},
): Promise<{ raw: string; hash: string }> {
  const { raw, hash } = createEmailToken();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (options.expiresOffset ?? 60 * 60 * 24);

  await db.insert(schema.auth_tokens).values({
    token_hash: hash,
    email,
    kind: 'verify',
    expires_at: expiresAt,
    used_at: options.usedAt ?? null,
  });

  return { raw, hash };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/verify', () => {
  let ctx: SetupResult;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('valid token → 200, email_verified_at set', async () => {
    const email = 'verify-me@example.com';
    await seedUnverifiedUser(ctx.db, email);
    const { raw } = await seedVerifyToken(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/verify', { token: raw }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(200);

    const user = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .get();

    expect(user!.email_verified_at).toBeGreaterThan(0);
  });

  it('valid token → session issued, Set-Cookie header present', async () => {
    const email = 'cookie-check@example.com';
    await seedUnverifiedUser(ctx.db, email);
    const { raw } = await seedVerifyToken(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/verify', { token: raw }, ctx.env),
      asEnv(ctx.env),
    );

    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('__Host-session=');
  });

  it('valid token → response body contains user fields', async () => {
    const email = 'body-check@example.com';
    await seedUnverifiedUser(ctx.db, email);
    const { raw } = await seedVerifyToken(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/verify', { token: raw }, ctx.env),
      asEnv(ctx.env),
    );
    const body = await res.json() as {
      ok: boolean;
      user: { id: string; email: string; email_verified_at: number };
    };

    expect(body.ok).toBe(true);
    expect(body.user.email).toBe(email);
    expect(body.user.id).toBeTruthy();
    expect(body.user.email_verified_at).toBeGreaterThan(0);
  });

  it('valid token → auth_tokens.used_at is set', async () => {
    const email = 'used-at@example.com';
    await seedUnverifiedUser(ctx.db, email);
    const { raw, hash } = await seedVerifyToken(ctx.db, email);

    await ctx.app.fetch(
      makePostRequest('/api/auth/verify', { token: raw }, ctx.env),
      asEnv(ctx.env),
    );

    const token = await ctx.db
      .select()
      .from(schema.auth_tokens)
      .where(eq(schema.auth_tokens.token_hash, hash))
      .get();

    expect(token!.used_at).toBeGreaterThan(0);
  });

  it('expired token → 410', async () => {
    const email = 'expired@example.com';
    await seedUnverifiedUser(ctx.db, email);
    const { raw } = await seedVerifyToken(ctx.db, email, { expiresOffset: -60 }); // already expired

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/verify', { token: raw }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(410);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_or_expired');
  });

  it('used token → 410', async () => {
    const email = 'usedtoken@example.com';
    await seedUnverifiedUser(ctx.db, email);
    const { raw } = await seedVerifyToken(ctx.db, email, {
      usedAt: Math.floor(Date.now() / 1000) - 100,
    });

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/verify', { token: raw }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(410);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_or_expired');
  });

  it('wrong token → 410', async () => {
    const email = 'wrongtoken@example.com';
    await seedUnverifiedUser(ctx.db, email);
    // Don't seed any token

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/verify', { token: 'nonexistent-token-abc123' }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(410);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_or_expired');
  });

  it('valid token → Cache-Control: no-store on response', async () => {
    const email = 'cache@example.com';
    await seedUnverifiedUser(ctx.db, email);
    const { raw } = await seedVerifyToken(ctx.db, email);

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/verify', { token: raw }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('second /verify with same token after first success → 410 (atomic consume)', async () => {
    // N-R3-4 remediation: the verify handler atomically flips used_at via
    // UPDATE ... RETURNING guarded by `used_at IS NULL`. A second caller with
    // the same raw token must see 410 — the CAS guarantees only one winner
    // even under TOCTOU-tight conditions.
    const email = 'atomic-verify@example.com';
    await seedUnverifiedUser(ctx.db, email);
    const { raw } = await seedVerifyToken(ctx.db, email);

    const first = await ctx.app.fetch(
      makePostRequest('/api/auth/verify', { token: raw }, ctx.env),
      asEnv(ctx.env),
    );
    expect(first.status).toBe(200);

    const second = await ctx.app.fetch(
      makePostRequest('/api/auth/verify', { token: raw }, ctx.env),
      asEnv(ctx.env),
    );
    expect(second.status).toBe(410);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe('invalid_or_expired');
  });

  it('pending-share backfill: accepted on verify, case-insensitive email match', async () => {
    const email = 'bob@example.com';
    await seedUnverifiedUser(ctx.db, email);
    const { raw } = await seedVerifyToken(ctx.db, email);

    // Create a second user as the inviter
    const inviterId = crypto.randomUUID();
    await ctx.db.insert(schema.users).values({
      id: inviterId,
      email: 'inviter@example.com',
    });

    // Create a tree
    const treeId = crypto.randomUUID();
    await ctx.db.insert(schema.trees).values({
      id: treeId,
      slug: 'test-tree',
      name: 'Test Tree',
      owner_id: inviterId,
      visibility: 'shared',
    });

    // Seed pending share with UPPER-CASED email to test case-insensitive matching
    const shareId = crypto.randomUUID();
    await ctx.db.insert(schema.tree_shares).values({
      id: shareId,
      tree_id: treeId,
      email: 'BOB@EXAMPLE.COM',
      user_id: null,
      status: 'pending',
      invited_by: inviterId,
    });

    // Verify
    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/verify', { token: raw }, ctx.env),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(200);

    // The share should now be accepted
    const share = await ctx.db
      .select()
      .from(schema.tree_shares)
      .where(eq(schema.tree_shares.id, shareId))
      .get();

    expect(share!.status).toBe('accepted');
    expect(share!.accepted_at).toBeGreaterThan(0);

    // user_id should be the now-verified user's id
    const user = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .get();
    expect(share!.user_id).toBe(user!.id);
  });
});
