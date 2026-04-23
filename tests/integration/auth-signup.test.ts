/**
 * Integration tests — POST /api/auth/signup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull } from 'drizzle-orm';
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
}

async function setup(): Promise<SetupResult> {
  const { d1, env } = createMockEnv();
  const db = drizzle(d1 as unknown as D1Database, { schema });

  const app = new Hono<HonoEnv>();
  // Inject db into c.var
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

function makePostRequest(path: string, body: unknown, _env?: unknown, origin?: string): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // CSRF: same-origin requests without Origin header are allowed by default
  if (origin !== undefined) {
    headers['Origin'] = origin;
  }
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/signup', () => {
  let ctx: SetupResult;

  beforeEach(async () => {
    ctx = await setup();
    // Reset email mock
    vi.clearAllMocks();
  });

  it('valid signup → 201 with ok:true', async () => {
    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/signup', {
        email: 'alice@example.com',
        password: 'supersecret1234',
        displayName: 'Alice',
      }),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('valid signup creates unverified user row', async () => {
    await ctx.app.fetch(
      makePostRequest('/api/auth/signup', {
        email: 'bob@example.com',
        password: 'supersecret1234',
      }),
      asEnv(ctx.env),
    );

    const user = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'bob@example.com'))
      .get();

    expect(user).toBeDefined();
    expect(user!.email_verified_at).toBeNull();
    expect(user!.password_hash).toBeTruthy();
    expect(user!.password_salt).toBeTruthy();
  });

  it('valid signup creates auth_token row with kind=verify', async () => {
    await ctx.app.fetch(
      makePostRequest('/api/auth/signup', {
        email: 'carol@example.com',
        password: 'supersecret1234',
      }),
      asEnv(ctx.env),
    );

    const token = await ctx.db
      .select()
      .from(schema.auth_tokens)
      .where(
        and(
          eq(schema.auth_tokens.email, 'carol@example.com'),
          eq(schema.auth_tokens.kind, 'verify'),
        ),
      )
      .get();

    expect(token).toBeDefined();
    expect(token!.used_at).toBeNull();
    expect(token!.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('valid signup calls sendVerificationEmail', async () => {
    await ctx.app.fetch(
      makePostRequest('/api/auth/signup', {
        email: 'dave@example.com',
        password: 'supersecret1234',
      }),
      asEnv(ctx.env),
    );

    expect(ctx.env.EMAIL.send).toHaveBeenCalledOnce();
    const call = (ctx.env.EMAIL.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.to).toBe('dave@example.com');
  });

  it('password shorter than 12 chars → 422', async () => {
    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/signup', {
        email: 'short@example.com',
        password: 'tooshort',
      }),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(422);
  });

  it('invalid email format → 422', async () => {
    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/signup', {
        email: 'not-an-email',
        password: 'supersecret1234',
      }),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(422);
  });

  it('existing unverified email → 201, old verify token deleted, new token created', async () => {
    // First signup
    await ctx.app.fetch(
      makePostRequest('/api/auth/signup', {
        email: 'eve@example.com',
        password: 'supersecret1234',
      }),
      asEnv(ctx.env),
    );

    // Get the original token
    const originalToken = await ctx.db
      .select()
      .from(schema.auth_tokens)
      .where(
        and(
          eq(schema.auth_tokens.email, 'eve@example.com'),
          eq(schema.auth_tokens.kind, 'verify'),
        ),
      )
      .get();
    expect(originalToken).toBeDefined();

    vi.clearAllMocks();

    // Second signup with same email
    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/signup', {
        email: 'eve@example.com',
        password: 'supersecret1234',
      }),
      asEnv(ctx.env),
    );
    expect(res.status).toBe(201);

    // Old token should be gone (deleted or replaced)
    const oldToken = await ctx.db
      .select()
      .from(schema.auth_tokens)
      .where(eq(schema.auth_tokens.id, originalToken!.id))
      .get();
    expect(oldToken).toBeUndefined();

    // A new token should exist
    const newToken = await ctx.db
      .select()
      .from(schema.auth_tokens)
      .where(
        and(
          eq(schema.auth_tokens.email, 'eve@example.com'),
          eq(schema.auth_tokens.kind, 'verify'),
          isNull(schema.auth_tokens.used_at),
        ),
      )
      .get();
    expect(newToken).toBeDefined();

    // Email should have been sent again
    expect(ctx.env.EMAIL.send).toHaveBeenCalledOnce();
  });

  it('existing verified email → 201, no email sent', async () => {
    // Create a verified user directly
    await ctx.db.insert(schema.users).values({
      id: crypto.randomUUID(),
      email: 'frank@example.com',
      password_hash: 'fakehash',
      password_salt: 'fakesalt',
      email_verified_at: Math.floor(Date.now() / 1000),
    });

    vi.clearAllMocks();

    const res = await ctx.app.fetch(
      makePostRequest('/api/auth/signup', {
        email: 'frank@example.com',
        password: 'supersecret1234',
      }),
      asEnv(ctx.env),
    );

    expect(res.status).toBe(201);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    // No email should have been sent
    expect(ctx.env.EMAIL.send).not.toHaveBeenCalled();
  });

  it('always returns same response body shape regardless of branch', async () => {
    // New user
    const r1 = await ctx.app.fetch(
      makePostRequest('/api/auth/signup', { email: 'g1@example.com', password: 'supersecret1234' }),
      asEnv(ctx.env),
    );
    // Unverified existing user
    const r2 = await ctx.app.fetch(
      makePostRequest('/api/auth/signup', { email: 'g1@example.com', password: 'supersecret1234' }),
      asEnv(ctx.env),
    );
    // Verified existing user
    await ctx.db.insert(schema.users).values({
      id: crypto.randomUUID(),
      email: 'g2@example.com',
      password_hash: 'fakehash',
      password_salt: 'fakesalt',
      email_verified_at: Math.floor(Date.now() / 1000),
    });
    const r3 = await ctx.app.fetch(
      makePostRequest('/api/auth/signup', { email: 'g2@example.com', password: 'supersecret1234' }),
      asEnv(ctx.env),
    );

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r3.status).toBe(201);
    expect(await r1.json()).toEqual({ ok: true });
    expect(await r2.json()).toEqual({ ok: true });
    expect(await r3.json()).toEqual({ ok: true });
  });

  it('email is lowercased before storing', async () => {
    await ctx.app.fetch(
      makePostRequest('/api/auth/signup', {
        email: 'MixedCase@Example.COM',
        password: 'supersecret1234',
      }),
      asEnv(ctx.env),
    );

    const user = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'mixedcase@example.com'))
      .get();

    expect(user).toBeDefined();
  });
});
