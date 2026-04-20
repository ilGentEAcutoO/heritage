/**
 * Session middleware — three exports shared by every route module:
 *
 *   dbMiddleware       — attaches `c.var.db` on every request.
 *   sessionMiddleware  — opportunistically loads session/user from cookie.
 *   requireAuth        — 401s if user wasn't loaded by sessionMiddleware.
 *
 * Cookie value is the raw 32-byte base64url session id. D1 stores only
 * sha256(id) so DB reads leak no valid cookie material.
 *
 * sessionMiddleware never rejects — it's opportunistic. Use `requireAuth`
 * after it on routes that need a logged-in user.
 */
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { and, eq, gt } from 'drizzle-orm';
import { createDb } from '../../db/client';
import { sessions, users } from '../../db/schema';
import { sha256Hash } from '../lib/tokens';
import type { HonoEnv, Session, SessionUser } from '../types';

export const SESSION_COOKIE = 'heritage_session';

export const dbMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  c.set('db', createDb(c.env.DB));
  await next();
};

export const sessionMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return next();

  const hash = sha256Hash(raw);
  const now = Math.floor(Date.now() / 1000);

  const db = c.var.db;
  const rows = await db
    .select({
      sid: sessions.id,
      uid: sessions.user_id,
      exp: sessions.expires_at,
      email: users.email,
      display_name: users.display_name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.user_id))
    .where(and(eq(sessions.token_hash, hash), gt(sessions.expires_at, now)))
    .limit(1);

  const row = rows[0];
  if (!row) return next();

  const session: Session = {
    id: row.sid,
    userId: row.uid,
    expiresAt: row.exp ?? 0,
  };
  const user: SessionUser = {
    id: row.uid,
    email: row.email,
    displayName: row.display_name ?? null,
  };
  c.set('session', session);
  c.set('user', user);
  await next();
};

export const requireAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!c.var.user) {
    return c.json({ error: 'unauthenticated' }, 401);
  }
  await next();
};
