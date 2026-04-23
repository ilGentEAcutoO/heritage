/**
 * Integration tests for the security-headers middleware (M15).
 *
 * Exercises the real Worker entry (src/worker/index.ts default export) so we
 * verify:
 *   - every response — health, tree read, img 404 — carries the full set of
 *     baseline security headers
 *   - the img route's own Cache-Control / Content-Disposition are NOT
 *     overwritten by the middleware
 *   - the CSP / Permissions-Policy values match the PR-3 spec exactly
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@db/schema';
import { seedDemo } from '@worker/lib/seed';
import { R2BucketStub, KVNamespaceStub } from '../helpers/mock-env';
import { _resetValidatedEnvCache } from '@worker/lib/config';

async function importApp() {
  const mod = await import('../../src/worker/index');
  return mod.default;
}

// Env factory that seeds the demo tree into a fresh D1 shim.
async function makeSeededEnv() {
  const d1 = createSqliteD1();
  const r2 = new R2BucketStub();
  const kv = new KVNamespaceStub();
  const db = drizzle(d1 as unknown as D1Database, { schema });
  await seedDemo(db);
  const env = {
    DB: d1 as unknown as D1Database,
    PHOTOS: r2 as unknown as R2Bucket,
    KV_RL: kv as unknown as KVNamespace,
    ASSETS: {
      fetch: async () => new Response('not found', { status: 404 }),
    } as unknown as Fetcher,
    EMAIL: {} as SendEmail,
    RL_LOGIN: {} as RateLimit,
    RL_LOGIN_IP: {} as RateLimit,
    APP_URL: 'http://localhost:5173',
    SESSION_SECRET: 'test-secret-at-least-thirty-two-characters-long-padding',
  };
  return { env, d1, r2, kv };
}

async function hit(
  method: string,
  path: string,
  env: Awaited<ReturnType<typeof makeSeededEnv>>['env'],
): Promise<Response> {
  const handler = await importApp();
  const req = new Request(`http://localhost${path}`, { method });
  return handler.fetch(req, env, {} as ExecutionContext);
}

// The exact header values the middleware is specified to emit. script-src
// includes 'unsafe-inline' + static.cloudflareinsights.com because Cloudflare
// auto-injects the Bot Management / Web Analytics scripts at the zone layer;
// see security-headers.ts for the full rationale.
const EXPECTED_CSP = [
  "default-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self' fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' static.cloudflareinsights.com",
  "connect-src 'self' static.cloudflareinsights.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');
const EXPECTED_HSTS = 'max-age=63072000; includeSubDomains; preload';
const EXPECTED_PERMISSIONS =
  'camera=(), microphone=(), geolocation=(), interest-cohort=()';
const EXPECTED_REFERRER = 'strict-origin-when-cross-origin';

function expectSecurityHeaders(res: Response): void {
  expect(res.headers.get('content-security-policy')).toBe(EXPECTED_CSP);
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('referrer-policy')).toBe(EXPECTED_REFERRER);
  expect(res.headers.get('strict-transport-security')).toBe(EXPECTED_HSTS);
  expect(res.headers.get('permissions-policy')).toBe(EXPECTED_PERMISSIONS);
}

describe('security headers middleware', () => {
  beforeEach(() => {
    _resetValidatedEnvCache();
  });

  test('GET /api/health → 200 with all security headers', async () => {
    const { env } = await makeSeededEnv();
    const res = await hit('GET', '/api/health', env);
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
  });

  test('GET /api/tree/wongsuriya → 200 with security headers (alongside JSON)', async () => {
    const { env } = await makeSeededEnv();
    const res = await hit('GET', '/api/tree/wongsuriya', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expectSecurityHeaders(res);
  });

  test('GET /api/img/<invalid> → 404 with security headers still present', async () => {
    const { env } = await makeSeededEnv();
    const res = await hit('GET', '/api/img/not-a-valid-key', env);
    expect(res.status).toBe(404);
    expectSecurityHeaders(res);
  });

  test('img route preserves its own Cache-Control / Content-Disposition', async () => {
    const { env, d1, r2 } = await makeSeededEnv();

    // Seed a valid photo row + R2 object for the demo tree.
    const db = drizzle(d1 as unknown as D1Database, { schema });
    const ULID = '01J0000000000000000000000A';
    const TREE_ID = 'tree-wongsuriya';
    const PERSON_ID = 'p1'; // present in the demo seed
    const KEY = `photos/${TREE_ID}/${PERSON_ID}/${ULID}.jpg`;

    await db.insert(schema.photos).values({
      id: 'photo-sec-001',
      person_id: PERSON_ID,
      object_key: KEY,
      mime: 'image/jpeg',
      bytes: 8,
      uploaded_by: null,
    });
    r2.seed(KEY, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));

    const res = await hit('GET', `/api/img/${KEY}`, env);
    expect(res.status).toBe(200);

    // Route-set headers survive intact.
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(res.headers.get('content-disposition')).toContain(`${ULID}.jpg`);
    expect(res.headers.get('content-type')).toBe('image/jpeg');

    // Security headers are still added on top.
    expectSecurityHeaders(res);
  });

  test('env validation failure → 500 with no crash', async () => {
    const { env } = await makeSeededEnv();
    // Force a fresh validation by clearing the cache and breaking APP_URL.
    _resetValidatedEnvCache();
    const broken = { ...env, APP_URL: 'not a url' } as typeof env;
    const handler = await importApp();
    const req = new Request('http://localhost/api/health', { method: 'GET' });
    const res = await handler.fetch(req, broken, {} as ExecutionContext);
    expect(res.status).toBe(500);
  });
});
