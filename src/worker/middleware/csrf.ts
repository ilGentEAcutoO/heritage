/**
 * CSRF middleware — origin/referer check on mutation verbs.
 *
 * SameSite=Lax cookies already block most cross-site POSTs, but a belt-and-
 * braces check on Origin (with Referer as fallback) gives us defense in depth
 * and catches a few edge cases Lax doesn't (e.g. top-level POST from a form).
 *
 * Rules:
 *   - GET/HEAD/OPTIONS: skip entirely (safe methods, not state-changing).
 *   - POST/PUT/PATCH/DELETE:
 *       - If Origin header is present, its scheme://host MUST match env.APP_URL.
 *       - Else if Referer header is present, its scheme://host MUST match.
 *       - Else: reject (no origin info = no safe decision).
 *
 * We compare by constructing URL() on both sides and matching `origin` strings
 * so port and protocol must match exactly. This is stricter than host-only
 * matching and prevents http↔https downgrades.
 */
import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function tryOrigin(urlLike: string | undefined | null): string | null {
  if (!urlLike) return null;
  try {
    // Origin header is already "scheme://host[:port]"; URL() handles that.
    // Referer is a full URL; URL().origin strips path.
    return new URL(urlLike).origin;
  } catch {
    return null;
  }
}

export const csrf: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();

  const expected = tryOrigin(c.env.APP_URL);
  if (!expected) {
    // Misconfiguration — fail closed.
    return c.json({ error: 'server_misconfigured' }, 500);
  }

  const originHeader = c.req.header('origin');
  const refererHeader = c.req.header('referer');

  const originOk = tryOrigin(originHeader) === expected;
  const refererOk = tryOrigin(refererHeader) === expected;

  if (!originOk && !refererOk) {
    return c.json({ error: 'forbidden_origin' }, 403);
  }

  await next();
};
