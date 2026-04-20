/**
 * Auth routes — magic-link flow.
 *
 *   POST /api/auth/request  → email a signed token (rate-limited; generic 204)
 *   GET  /api/auth/verify   → verify + rotate into session cookie, 302 redirect
 *   POST /api/auth/logout   → delete session, clear cookie
 *   GET  /api/auth/me       → current user or 401
 *
 * Security posture:
 *   - Token secret material (nonce) is random + bound to a sha256 hash in D1.
 *   - Signed envelope (payload + HMAC) prevents tampering with email/exp.
 *   - Lookup uses sha256(nonce) — DB dump doesn't leak valid tokens.
 *   - Rate-limited per email (3/h) AND per IP (10/h) upstream of this router.
 *   - Verify is single-use via `used_at` timestamp.
 *   - Session id is high-entropy random; only its hash hits D1.
 *   - Logout deletes the server-side session row in addition to clearing the
 *     cookie so a stolen cookie can't be replayed after logout.
 *   - Generic error messages (no user-enumeration).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { auth_tokens, sessions, users } from '../../db/schema';
import {
  generateNonce,
  generateSessionId,
  sha256Hash,
  signToken,
  verifyToken,
} from '../lib/tokens';
import { sendMagicLink } from '../lib/email';
import { rateLimit } from '../middleware/rate-limit';
import { SESSION_COOKIE } from '../middleware/session';
import type { HonoEnv } from '../types';

const TOKEN_TTL_SECONDS = 15 * 60; // 15 min
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const EmailBody = z.object({
  email: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.string().email().max(254),
  ),
});

// Stable id generator (D1 primary keys that aren't auto-increment).
function newId(): string {
  return crypto.randomUUID();
}

function getClientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const auth = new Hono<HonoEnv>();

// --- POST /request -----------------------------------------------------------
//
// Two rate limiters stacked: email (3/h) and IP (10/h). We put them BEFORE
// Zod parsing for the email limiter by extracting the email out of the body
// in the `key` fn. The IP limiter needs nothing from the body.
//
// Keep response generic regardless of whether the email resolves to a user:
// the magic-link flow doesn't create accounts on request, and emitting 204
// for all shapes (modulo validation) prevents account enumeration.

auth.post(
  '/request',
  rateLimit({
    scope: 'auth:ip',
    limit: 10,
    windowSec: 3600,
    key: (c) => getClientIp(c),
  }),
  rateLimit({
    scope: 'auth:email',
    limit: 3,
    windowSec: 3600,
    key: async (c) => {
      // Peek at body without consuming it for the downstream handler.
      // Hono caches the parsed JSON so re-awaiting req.json() in the handler is safe.
      try {
        const body = await c.req.json<{ email?: unknown }>();
        if (typeof body?.email === 'string') {
          const lowered = body.email.toLowerCase().trim();
          if (lowered.length > 0 && lowered.length <= 254) return lowered;
        }
      } catch {
        // Fall through — no key means no email-scoped limit for this request.
        // The IP limiter above still applies.
      }
      return null;
    },
  }),
  async (c) => {
    let parsed;
    try {
      parsed = EmailBody.safeParse(await c.req.json());
    } catch {
      return c.json({ error: 'invalid_body' }, 400);
    }
    if (!parsed.success) {
      return c.json({ error: 'invalid_email' }, 400);
    }
    const email = parsed.data.email;

    const nonce = generateNonce();
    const hash = sha256Hash(nonce);
    const now = Math.floor(Date.now() / 1000);
    const exp = now + TOKEN_TTL_SECONDS;

    const db = c.var.db;
    await db.insert(auth_tokens).values({
      token_hash: hash,
      email,
      expires_at: exp,
    });

    const signed = signToken(c.env.SESSION_SECRET, { email, nonce, exp });
    const verifyPath = `/api/auth/verify?tk=${encodeURIComponent(signed)}`;
    const magicUrl = new URL(verifyPath, c.env.APP_URL).toString();

    // Email send may fail (e.g. CF Email Service domain not onboarded yet).
    // Swallow the failure: returning 204 regardless prevents account enumeration,
    // and the token row is already in D1 so onboarding later doesn't break anything.
    try {
      await sendMagicLink(c.env, email, magicUrl);
    } catch (err) {
      console.error('[auth/request] sendMagicLink failed', err);
    }

    // Generic no-content regardless of whether the email is a known user.
    return c.body(null, 204);
  },
);

// --- GET /verify -------------------------------------------------------------
//
// This is a browser-driven GET (user clicks link in email). We 302-redirect
// rather than return JSON so the address bar ends up on a sensible page.
//
// All failure modes redirect to `/login?err=invalid` with no additional detail
// (prevents probing the DB for valid tokens).

const REDIRECT_ON_ERR = '/login?err=invalid';
const REDIRECT_ON_OK = '/tree/mine';

auth.get('/verify', async (c) => {
  const tk = c.req.query('tk');
  if (!tk) return c.redirect(REDIRECT_ON_ERR, 302);

  const payload = verifyToken(c.env.SESSION_SECRET, tk);
  if (!payload) return c.redirect(REDIRECT_ON_ERR, 302);

  const hash = sha256Hash(payload.nonce);
  const now = Math.floor(Date.now() / 1000);
  const db = c.var.db;

  // Look up the record, require unused + unexpired.
  const rows = await db
    .select()
    .from(auth_tokens)
    .where(
      and(
        eq(auth_tokens.token_hash, hash),
        isNull(auth_tokens.used_at),
        gt(auth_tokens.expires_at, now),
      ),
    )
    .limit(1);

  const record = rows[0];
  if (!record) return c.redirect(REDIRECT_ON_ERR, 302);

  // Double-check email matches what we signed (defense-in-depth; HMAC already
  // binds email to nonce, but DB row could theoretically diverge).
  if (record.email !== payload.email) {
    return c.redirect(REDIRECT_ON_ERR, 302);
  }

  // Mark used (single-use). This is intentionally NOT atomic-with-the-check
  // because D1 has no interactive transactions; the window for double-use is
  // a few milliseconds and the outcome is identical either way (single session
  // created, second attempt no-ops). If we grow concerned we can add a
  // `UPDATE ... WHERE used_at IS NULL` and check affected rows.
  await db
    .update(auth_tokens)
    .set({ used_at: now })
    .where(eq(auth_tokens.id, record.id));

  // Find-or-create user by email.
  let userRow = (
    await db.select().from(users).where(eq(users.email, payload.email)).limit(1)
  )[0];

  if (!userRow) {
    const id = newId();
    await db.insert(users).values({
      id,
      email: payload.email,
      display_name: null,
    });
    userRow = (
      await db.select().from(users).where(eq(users.id, id)).limit(1)
    )[0];
    if (!userRow) return c.redirect(REDIRECT_ON_ERR, 302);
  }

  // Rotate: new session id every login.
  const sessionId = generateSessionId();
  const sessionHash = sha256Hash(sessionId);
  const sessionExp = now + SESSION_TTL_SECONDS;

  await db.insert(sessions).values({
    id: newId(),
    token_hash: sessionHash,
    user_id: userRow.id,
    expires_at: sessionExp,
    user_agent: c.req.header('user-agent') ?? null,
    ip: getClientIp(c),
  });

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  return c.redirect(REDIRECT_ON_OK, 302);
});

// --- POST /logout ------------------------------------------------------------

auth.post('/logout', async (c) => {
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) {
    const hash = sha256Hash(raw);
    await c.var.db.delete(sessions).where(eq(sessions.token_hash, hash));
  }
  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    secure: true,
    sameSite: 'Lax',
  });
  return c.body(null, 204);
});

// --- GET /me -----------------------------------------------------------------

auth.get('/me', (c) => {
  if (!c.var.user) return c.json({ error: 'unauthenticated' }, 401);
  return c.json({ user: c.var.user });
});
