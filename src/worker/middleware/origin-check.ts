/**
 * origin-check.ts — explicit Origin allow-list for mutation methods.
 *
 * Defense-in-depth against CSRF. Hono's built-in `csrf()` only inspects the
 * classic form-submittable content types (x-www-form-urlencoded, multipart,
 * text/plain). `application/json` requests ride through `csrf()` untouched,
 * leaving us relying on two implicit browser defences (SameSite=Lax cookie +
 * CORS preflight). Both are brittle against future config changes.
 *
 * This middleware runs on every `POST | PUT | PATCH | DELETE` regardless of
 * Content-Type, rejecting with `403 forbidden_origin` if an `Origin` header
 * is present and does NOT match `env.APP_URL` (after trimming trailing slash).
 *
 * Missing `Origin` is allowed because:
 *   - Same-origin simple form POSTs from classic HTML pages don't send Origin
 *     in some older browsers.
 *   - curl / tooling / test harnesses typically omit it.
 *   - A cross-origin attacker cannot suppress Origin on a fetch-initiated
 *     POST from the browser (the browser always sets it for CORS-relevant
 *     requests), so the missing-Origin path is not an attacker-controlled
 *     bypass in practice.
 *
 * GET/HEAD/OPTIONS are untouched — read-only traffic is not a CSRF target.
 */

import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../types';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const originCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (!MUTATION_METHODS.has(method)) {
    return next();
  }

  const origin = c.req.header('Origin');
  if (!origin) {
    // Missing Origin is allowed — browsers always set it on cross-origin
    // fetches, so absence implies same-origin or non-browser tooling.
    return next();
  }

  const appUrl = c.env?.APP_URL;
  if (!appUrl) {
    // If APP_URL isn't configured we can't decide safely — fail open only when
    // the env is genuinely unavailable (test harnesses without mocks, etc.).
    return next();
  }

  const expected = appUrl.replace(/\/$/, '');
  if (origin !== expected) {
    return c.json({ error: 'forbidden_origin' }, 403);
  }

  return next();
};
