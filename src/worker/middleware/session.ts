/**
 * Session middleware — reads `__Host-session` cookie, resolves the session row,
 * and populates `c.var.user`. Implements sliding-window refresh.
 */

import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, and, gt } from 'drizzle-orm';
import { hashToken } from '../lib/tokens';
import { sessions, users } from '../../db/schema';
import type { HonoEnv } from '../types';

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_NAME = '__Host-session';
/** 14 days in seconds */
export const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 14;
/** 7 days in seconds — if less time remains, extend the session */
export const SESSION_SLIDING_REFRESH_THRESHOLD_SECONDS = 60 * 60 * 24 * 7;

// ---------------------------------------------------------------------------
// sessionMiddleware
// ---------------------------------------------------------------------------

/**
 * Reads the `__Host-session` cookie. If a valid, non-expired session row exists,
 * populates `c.var.user` with the user record. Otherwise sets `c.var.user = null`.
 * Performs sliding refresh: if the session expires in less than 7 days, extends
 * `expires_at` to now + 14 days (fire-and-forget via waitUntil when available).
 * Never throws — on any error, sets user=null and continues.
 */
export const sessionMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  // Default to no user
  c.set('user', null);

  try {
    const raw = getCookie(c, SESSION_COOKIE_NAME);
    if (!raw) {
      return next();
    }

    const tokenHash = hashToken(raw);
    const now = Math.floor(Date.now() / 1000);

    const db = c.var.db;

    // Look up a non-expired session
    const session = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.token_hash, tokenHash),
          gt(sessions.expires_at, now),
        ),
      )
      .get();

    if (!session) {
      return next();
    }

    // Fetch the associated user
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        email_verified_at: users.email_verified_at,
      })
      .from(users)
      .where(eq(users.id, session.user_id))
      .get();

    if (!user) {
      return next();
    }

    c.set('user', {
      id: user.id,
      email: user.email,
      email_verified_at: user.email_verified_at ?? null,
    });

    // Sliding refresh: extend session if expiring soon
    if (
      session.expires_at !== null &&
      session.expires_at !== undefined &&
      session.expires_at - now < SESSION_SLIDING_REFRESH_THRESHOLD_SECONDS
    ) {
      const newExpiry = now + SESSION_LIFETIME_SECONDS;
      const updatePromise = db
        .update(sessions)
        .set({ expires_at: newExpiry })
        .where(eq(sessions.id, session.id));

      // Use waitUntil for fire-and-forget in production; fall back to plain await in test env.
      // Accessing c.executionCtx throws when there is no ExecutionContext (e.g. test env),
      // so we probe it defensively.
      let hasWaitUntil = false;
      try {
        hasWaitUntil =
          c.executionCtx != null && typeof c.executionCtx.waitUntil === 'function';
      } catch {
        hasWaitUntil = false;
      }

      if (hasWaitUntil) {
        c.executionCtx.waitUntil(updatePromise);
      } else {
        await updatePromise;
      }
    }
  } catch (err) {
    console.warn('[sessionMiddleware] error resolving session:', err);
    c.set('user', null);
  }

  return next();
};

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

/**
 * Requires that sessionMiddleware has already run and `c.var.user` is populated.
 * Returns 401 JSON if user is null. Otherwise calls next().
 */
export const requireAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!c.var.user) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return next();
};
