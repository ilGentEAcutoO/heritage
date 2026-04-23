/**
 * auth.ts — Email+password auth sub-router
 *
 * Coordinator mounts with `app.route('/api/auth', authRouter)`.
 * CSRF protection is centralised in the global `originCheck` middleware
 * (`src/worker/middleware/origin-check.ts`); this router is no longer
 * responsible for CSRF — it previously layered hono/csrf() here, but that
 * middleware did not inspect application/json bodies. See N-R3-2.
 *
 * Routes:
 *   POST /signup          — Create account (enumeration-safe)
 *   POST /verify          — Verify email token, issue session
 *   POST /login           — Password login with rate limiting
 *   POST /logout          — Invalidate session
 *   POST /request-reset   — Trigger password reset email
 *   POST /reset           — Apply new password from reset token
 *   GET  /me              — Return authenticated user info
 *   POST /magic/request   — Issue a magic-link token (enumeration-safe)
 *   POST /magic/consume   — Consume magic-link token, issue session
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { eq, and, gt, isNull, sql } from 'drizzle-orm';
import type { HonoEnv } from '../types';
import { hashPassword, verifyPassword, dummyVerifyPassword } from '../lib/password';
import { sendVerificationEmail, sendPasswordResetEmail, sendMagicLinkEmail } from '../lib/email';
import type { SendEmailBinding } from '../lib/email';
import { createSessionToken, createEmailToken, hashToken } from '../lib/tokens';
import { users, auth_tokens, sessions, tree_shares } from '../../db/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_COOKIE_NAME = '__Host-session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // 14 days in seconds

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const signupSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  displayName: z.string().optional(),
});

const verifySchema = z.object({
  token: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1),
});

const requestResetSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
});

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(12, 'Password must be at least 12 characters'),
});

const magicRequestSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
});

const magicConsumeSchema = z.object({
  token: z.string().min(32).max(128),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const authRouter = new Hono<HonoEnv>();

// CSRF handling moved to the global originCheck middleware (see index.ts).
// That middleware covers every mutation method across every router — unlike
// hono/csrf() it inspects JSON bodies as well.

// ---------------------------------------------------------------------------
// Helper: issue session cookie
// ---------------------------------------------------------------------------

async function issueSession(
  c: Context<HonoEnv>,
  userId: string,
): Promise<void> {
  const { raw, hash } = createSessionToken();
  const now = Math.floor(Date.now() / 1000);

  // N-R3-8: `ip` and `user_agent` are retained for audit purposes and MUST be
  // purged after `expires_at` via `deleteExpiredSessions` (see lib/session-cleanup.ts).
  await c.var.db.insert(sessions).values({
    id: crypto.randomUUID(),
    token_hash: hash,
    user_id: userId,
    expires_at: now + SESSION_MAX_AGE,
    user_agent: c.req.header('User-Agent') ?? null,
    ip: c.req.header('CF-Connecting-IP') ?? null,
  });

  setCookie(c, SESSION_COOKIE_NAME, raw, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: SESSION_MAX_AGE,
  });
}

// ---------------------------------------------------------------------------
// POST /signup
// ---------------------------------------------------------------------------

authRouter.post('/signup', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);
  }

  const { email, password, displayName } = parsed.data;
  const db = c.var.db;
  const appUrl = c.env?.APP_URL ?? 'http://localhost:5173';

  // Always return 201 — never reveal whether email exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (!existing) {
    // New user: create account (unverified), send verification email
    const { hash, salt } = await hashPassword(password);
    const userId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email,
      display_name: displayName ?? null,
      password_hash: hash,
      password_salt: salt,
    });

    // Create verify token (24h TTL)
    const { raw, hash: tokenHash } = createEmailToken();
    const now = Math.floor(Date.now() / 1000);
    await db.insert(auth_tokens).values({
      token_hash: tokenHash,
      email,
      kind: 'verify',
      expires_at: now + 60 * 60 * 24,
    });

    // Send verification email (best-effort; swallow errors)
    try {
      // Platform SendEmail overloads are not narrowable to our interface shape — cast required.
      await sendVerificationEmail(c.env.EMAIL as unknown as SendEmailBinding, { to: email, token: raw, appUrl });
    } catch {
      // Don't fail signup if email send fails in dev/test
    }
  } else if (!existing.email_verified_at) {
    // Existing unverified user: delete old unused verify tokens, resend
    const now = Math.floor(Date.now() / 1000);

    // Delete old unused verify tokens for this email
    await db
      .delete(auth_tokens)
      .where(
        and(
          eq(auth_tokens.email, email),
          eq(auth_tokens.kind, 'verify'),
          isNull(auth_tokens.used_at),
        ),
      );

    const { raw, hash: tokenHash } = createEmailToken();
    await db.insert(auth_tokens).values({
      token_hash: tokenHash,
      email,
      kind: 'verify',
      expires_at: now + 60 * 60 * 24,
    });

    try {
      await sendVerificationEmail(c.env.EMAIL as unknown as SendEmailBinding, { to: email, token: raw, appUrl });
    } catch {
      // Swallow
    }
  }
  // else: existing verified user — silently do nothing (v1 spec)

  return c.json({ ok: true }, 201);
});

// ---------------------------------------------------------------------------
// POST /verify
// ---------------------------------------------------------------------------

authRouter.post('/verify', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_or_expired' }, 410);
  }

  const { token } = parsed.data;
  const db = c.var.db;
  const tokenHash = hashToken(token);
  const now = Math.floor(Date.now() / 1000);

  // N-R3-4 remediation: atomic UPDATE ... RETURNING to close the TOCTOU
  // window between SELECT and UPDATE. The `used_at IS NULL` predicate is the
  // CAS — only the first concurrent caller can flip the token, subsequent
  // callers get zero rows back and return 410.
  const consumed = await db
    .update(auth_tokens)
    .set({ used_at: now })
    .where(
      and(
        eq(auth_tokens.token_hash, tokenHash),
        eq(auth_tokens.kind, 'verify'),
        isNull(auth_tokens.used_at),
        gt(auth_tokens.expires_at, now),
      ),
    )
    .returning({ id: auth_tokens.id, email: auth_tokens.email })
    .all();

  const authToken = consumed[0];
  if (!authToken || !authToken.email) {
    return c.json({ error: 'invalid_or_expired' }, 410);
  }

  const email = authToken.email;

  // Mark user as verified
  await db
    .update(users)
    .set({ email_verified_at: now })
    .where(eq(users.email, email));

  // Fetch the now-verified user
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (!user) {
    return c.json({ error: 'invalid_or_expired' }, 410);
  }

  // Pending-share backfill: accept any pending shares for this email
  await db
    .update(tree_shares)
    .set({
      user_id: user.id,
      status: 'accepted',
      accepted_at: now,
    })
    .where(
      and(
        sql`lower(${tree_shares.email}) = lower(${email})`,
        isNull(tree_shares.user_id),
        eq(tree_shares.status, 'pending'),
      ),
    );

  // Issue session
  await issueSession(c, user.id);

  c.header('Cache-Control', 'no-store');
  return c.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      email_verified_at: user.email_verified_at,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------

authRouter.post('/login', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);
  }

  const { email, password } = parsed.data;

  // Rate limit: per email first, then per IP
  const { success: emailOk } = await c.env.RL_LOGIN.limit({ key: email });
  if (!emailOk) return c.json({ error: 'too_many_attempts' }, 429);

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const { success: ipOk } = await c.env.RL_LOGIN_IP.limit({ key: ip });
  if (!ipOk) return c.json({ error: 'too_many_attempts' }, 429);

  const db = c.var.db;

  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  // User missing or no password hash: dummy verify for timing parity
  if (!user || !user.password_hash) {
    await dummyVerifyPassword(password);
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  // User exists but email not verified: collapse into the SAME 401 response as
  // unknown-email / wrong-password to close the user-enumeration vector.
  // verifyPassword still runs for timing parity (matches both unknown + wrong-pw paths).
  if (!user.email_verified_at) {
    await verifyPassword(password, user.password_hash, user.password_salt ?? '');
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  // Verify password
  const valid = await verifyPassword(password, user.password_hash, user.password_salt ?? '');
  if (!valid) {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  // Issue session
  await issueSession(c, user.id);

  c.header('Cache-Control', 'no-store');
  return c.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      email_verified_at: user.email_verified_at,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------

authRouter.post('/logout', async (c) => {
  const raw = getCookie(c, SESSION_COOKIE_NAME);

  if (raw) {
    const tokenHash = hashToken(raw);
    await c.var.db
      .delete(sessions)
      .where(eq(sessions.token_hash, tokenHash));
  }

  // __Host- prefix requires Secure and Path=/ when deleting
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/', secure: true, httpOnly: true, sameSite: 'Lax' });
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// POST /request-reset
// ---------------------------------------------------------------------------

authRouter.post('/request-reset', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.body(null, 204);
  }

  const parsed = requestResetSchema.safeParse(body);
  if (!parsed.success) {
    return c.body(null, 204);
  }

  const { email } = parsed.data;

  // Rate limit by email (reuse RL_LOGIN bucket)
  const { success: emailOk } = await c.env.RL_LOGIN.limit({ key: email });
  if (!emailOk) {
    // Even on rate limit, return 204 (anti-enumeration)
    return c.body(null, 204);
  }

  const db = c.var.db;
  const appUrl = c.env?.APP_URL ?? 'http://localhost:5173';

  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (user) {
    const { raw, hash: tokenHash } = createEmailToken();
    const now = Math.floor(Date.now() / 1000);

    await db.insert(auth_tokens).values({
      token_hash: tokenHash,
      email,
      kind: 'reset',
      expires_at: now + 60 * 60, // 1h TTL
    });

    try {
      await sendPasswordResetEmail(c.env.EMAIL as unknown as SendEmailBinding, { to: email, token: raw, appUrl });
    } catch {
      // Swallow
    }
  }

  // Always 204 — never reveal email existence
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// POST /reset
// ---------------------------------------------------------------------------

authRouter.post('/reset', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);
  }

  const { token, newPassword } = parsed.data;
  const db = c.var.db;
  const tokenHash = hashToken(token);
  const now = Math.floor(Date.now() / 1000);

  // N-R3-4 remediation: atomic UPDATE ... RETURNING for reset token — see
  // /verify handler for rationale. The `used_at IS NULL` predicate is the CAS.
  const consumed = await db
    .update(auth_tokens)
    .set({ used_at: now })
    .where(
      and(
        eq(auth_tokens.token_hash, tokenHash),
        eq(auth_tokens.kind, 'reset'),
        isNull(auth_tokens.used_at),
        gt(auth_tokens.expires_at, now),
      ),
    )
    .returning({ id: auth_tokens.id, email: auth_tokens.email })
    .all();

  const authToken = consumed[0];
  if (!authToken || !authToken.email) {
    return c.json({ error: 'invalid_or_expired' }, 410);
  }

  const email = authToken.email;

  // Hash and update password
  const { hash, salt } = await hashPassword(newPassword);

  // Fetch the user to get user_id for session invalidation
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (!user) {
    return c.json({ error: 'invalid_or_expired' }, 410);
  }

  await db
    .update(users)
    .set({ password_hash: hash, password_salt: salt })
    .where(eq(users.id, user.id));

  // Invalidate ALL sessions for this user — force re-login everywhere
  await db.delete(sessions).where(eq(sessions.user_id, user.id));

  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// GET /me
// ---------------------------------------------------------------------------

authRouter.get('/me', (c) => {
  // Inline auth check — coordinator wires sessionMiddleware separately
  const user = c.var.user;
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return c.json({ user });
});

// ---------------------------------------------------------------------------
// POST /magic/request
// ---------------------------------------------------------------------------
//
// Neutral response always 200 regardless of whether the email exists — no
// enumeration. Rate-limited per-email (RL_LOGIN) then per-IP (RL_LOGIN_IP).
//
// On the no-user / unverified path we still call hashToken() with a synthetic
// value to approximately match the crypto cost of the happy path (constant-
// time neutrality at our scale).

authRouter.post('/magic/request', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const parsed = magicRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 400);
  }

  const { email } = parsed.data;

  // Rate limit: per email first (RL_LOGIN), then per IP (RL_LOGIN_IP)
  const { success: emailOk } = await c.env.RL_LOGIN.limit({ key: email });
  if (!emailOk) return c.json({ error: 'too_many_attempts' }, 429);

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const { success: ipOk } = await c.env.RL_LOGIN_IP.limit({ key: ip });
  if (!ipOk) return c.json({ error: 'too_many_attempts' }, 429);

  const db = c.var.db;
  const appUrl = c.env?.APP_URL ?? 'http://localhost:5173';

  const NEUTRAL_MESSAGE = 'If an account exists with that email, we sent a sign-in link.';

  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  // Happy path: verified user exists — create token and send email
  if (user && user.email_verified_at) {
    const { raw, hash: tokenHash } = createEmailToken();
    const now = Math.floor(Date.now() / 1000);

    await db.insert(auth_tokens).values({
      token_hash: tokenHash,
      email,
      kind: 'magic',
      expires_at: now + 15 * 60, // 15-minute TTL
    });

    try {
      await sendMagicLinkEmail(c.env.EMAIL as unknown as SendEmailBinding, {
        to: email,
        token: raw,
        appUrl,
      });
    } catch {
      // Swallow — don't fail the request if email send errors in dev/test
    }
  } else {
    // Constant-time filler: run hashToken() to approximate the crypto cost of
    // the happy path and prevent trivial timing enumeration.
    hashToken('constant-time-filler-32chars-minimum-pad');
    await Promise.resolve();
  }

  return c.json({ message: NEUTRAL_MESSAGE });
});

// ---------------------------------------------------------------------------
// POST /magic/consume
// ---------------------------------------------------------------------------
//
// Consumes a magic-link token via atomic CAS UPDATE ... RETURNING.
// Filters by kind='magic' so verify/reset tokens cannot be replayed here.
// On success: issues a session cookie and returns { user }.
// All failure modes return the same neutral 400 to prevent information leakage.

authRouter.post('/magic/consume', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const parsed = magicConsumeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 400);
  }

  const { token } = parsed.data;
  const db = c.var.db;
  const tokenHash = hashToken(token);
  const now = Math.floor(Date.now() / 1000);

  const FAILURE_RESPONSE = { message: 'Link expired or already used' } as const;

  // Atomic CAS: only the first caller with a valid, unused, unexpired magic token wins.
  const consumed = await db
    .update(auth_tokens)
    .set({ used_at: now })
    .where(
      and(
        eq(auth_tokens.token_hash, tokenHash),
        eq(auth_tokens.kind, 'magic'),
        isNull(auth_tokens.used_at),
        gt(auth_tokens.expires_at, now),
      ),
    )
    .returning({ id: auth_tokens.id, email: auth_tokens.email })
    .all();

  const authToken = consumed[0];
  if (!authToken || !authToken.email) {
    return c.json(FAILURE_RESPONSE, 400);
  }

  const userEmail = authToken.email;

  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, userEmail))
    .get();

  if (!user) {
    // Should not happen (token references a valid email), but guard defensively
    return c.json(FAILURE_RESPONSE, 400);
  }

  // Issue session cookie
  await issueSession(c, user.id);

  c.header('Cache-Control', 'no-store');
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      email_verified_at: user.email_verified_at,
    },
  });
});
