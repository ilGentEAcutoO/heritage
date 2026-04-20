/**
 * security-headers.ts — add baseline security response headers to every
 * Worker response (M15 remediation).
 *
 * Mounted as the OUTERMOST middleware in `src/worker/index.ts`, so it sees
 * every response produced by downstream routes. We only ever APPEND headers;
 * we never overwrite values that a route has already set. This matters for:
 *
 *   - `Content-Type`         — routes set per-resource MIME
 *   - `Content-Disposition`  — `img.ts` sets `inline; filename=...`
 *   - `Cache-Control`        — `img.ts` sets `public, max-age=60`
 *   - `Vary`                 — `img.ts` sets `Cookie`
 *
 * The CSP intentionally omits `object-src`, `worker-src`, etc. — the
 * `default-src 'self'` fallback covers them. `frame-ancestors 'none'` doubles
 * as the modern replacement for `X-Frame-Options: DENY`.
 */
import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../types';

const CSP = [
  "default-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self' fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

/**
 * Headers we always want to add. These never conflict with per-route output,
 * so a blind `set()` is safe. `X-Content-Type-Options` is also set by
 * `img.ts`; setting the identical value from both sites is fine.
 */
const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
});

/**
 * Hono middleware. Runs `await next()`, then layers security headers over the
 * response without clobbering anything a route already set.
 *
 * We must never mutate the Response object a route returned directly — some
 * responses (e.g. R2 streamed bodies) have locked headers. `c.res = new
 * Response(...)` on Hono re-wraps the response so mutations are safe.
 */
export const securityHeaders: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  const headers = c.res.headers;
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
};

export default securityHeaders;
