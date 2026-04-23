/**
 * config.ts — runtime environment assertion (M2 remediation).
 *
 * Validates that `APP_URL` is defined, parseable, and (in production) uses
 * https. Cached after first success so we don't re-validate on every request.
 *
 * Called from the Worker fetch handler; failure returns a 500 to the client
 * and surfaces a descriptive error in logs.
 */
import type { Env } from '../types';

/**
 * Production detection: we're on Cloudflare Workers, so there's no canonical
 * `NODE_ENV`. Treat any non-localhost https APP_URL as production. Local dev
 * uses http://localhost:5173 which is accepted.
 */
function isProductionUrl(url: URL): boolean {
  const host = url.hostname;
  const isLoopback =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local');
  return !isLoopback;
}

/**
 * Throws descriptive Error on invalid env. Safe to call many times; callers
 * that want caching should go through `getValidatedEnv`.
 */
export function assertEnv(env: Env): void {
  const raw = env.APP_URL;
  if (raw === undefined || raw === null || raw === '') {
    throw new Error('APP_URL is not defined');
  }
  if (typeof raw !== 'string') {
    throw new Error('APP_URL must be a string');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`APP_URL is not a valid URL: ${raw}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`APP_URL must use http or https protocol: ${raw}`);
  }

  if (isProductionUrl(parsed) && parsed.protocol !== 'https:') {
    throw new Error(
      `APP_URL must use https in production (got ${parsed.protocol}//${parsed.hostname})`,
    );
  }

  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 chars');
  }
}

// ---------------------------------------------------------------------------
// Cached validator
// ---------------------------------------------------------------------------

/**
 * Module-level cache flag. Set once the current process has seen a valid Env,
 * cleared only when the module reloads (e.g. on Worker re-deploy). Storing by
 * reference identity means a test that swaps in a different Env object will
 * re-validate, which is the behavior tests want.
 */
let validatedRef: WeakSet<Env> | null = null;

export function getValidatedEnv(env: Env): Env {
  if (validatedRef === null) {
    validatedRef = new WeakSet();
  }
  if (!validatedRef.has(env)) {
    assertEnv(env);
    validatedRef.add(env);
  }
  return env;
}

/** Test-only: forget the cached validation decision. */
export function _resetValidatedEnvCache(): void {
  validatedRef = null;
}
