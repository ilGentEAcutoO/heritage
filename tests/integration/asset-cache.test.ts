/**
 * Integration tests for Perf Fix 2 — immutable Cache-Control on /assets/* responses.
 *
 * Verifies:
 *   1. GET /assets/index-abc123.js → Cache-Control: public, max-age=31536000, immutable
 *      AND all security headers still present (not clobbered).
 *   2. GET / (HTML SPA root) → does NOT receive the immutable Cache-Control override.
 *
 * Uses the real Worker entry (src/worker/index.ts) and mocks ASSETS.fetch so tests
 * remain hermetic without a real Cloudflare Assets binding.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createMockEnv } from '../helpers/mock-env';
import { _resetValidatedEnvCache } from '@worker/lib/config';

async function importApp() {
  const mod = await import('../../src/worker/index');
  return mod.default;
}

const IMMUTABLE_CC = 'public, max-age=31536000, immutable';

// The exact security header values the middleware emits — same as security-headers.test.ts.
const EXPECTED_CSP = [
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

function expectSecurityHeaders(res: Response): void {
  expect(res.headers.get('content-security-policy')).toBe(EXPECTED_CSP);
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  expect(res.headers.get('strict-transport-security')).toBe(
    'max-age=63072000; includeSubDomains; preload',
  );
}

describe('Perf Fix 2 — immutable cache on /assets/*', () => {
  beforeEach(() => {
    _resetValidatedEnvCache();
  });

  test('GET /assets/index-abc123.js → Cache-Control: immutable + security headers intact', async () => {
    const { env } = createMockEnv();

    // Mock ASSETS to return a JS file for the asset path.
    env.ASSETS = {
      fetch: async (_req: RequestInfo | URL) =>
        new Response('console.log("hello")', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript' },
        }),
    } as unknown as Fetcher;

    const handler = await importApp();
    const req = new Request('http://localhost/assets/index-abc123.js');
    const res = await handler.fetch(req, env, {} as ExecutionContext);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(IMMUTABLE_CC);

    // Security headers must survive.
    expectSecurityHeaders(res);
  });

  test('GET /assets/chunk-xyz.css → Cache-Control: immutable', async () => {
    const { env } = createMockEnv();
    env.ASSETS = {
      fetch: async (_req: RequestInfo | URL) =>
        new Response('body { color: red }', {
          status: 200,
          headers: { 'Content-Type': 'text/css' },
        }),
    } as unknown as Fetcher;

    const handler = await importApp();
    const req = new Request('http://localhost/assets/chunk-xyz.css');
    const res = await handler.fetch(req, env, {} as ExecutionContext);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(IMMUTABLE_CC);
  });

  test('GET / (SPA root) → does NOT get immutable Cache-Control override', async () => {
    const { env } = createMockEnv();
    env.ASSETS = {
      fetch: async (_req: RequestInfo | URL) =>
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    } as unknown as Fetcher;

    const handler = await importApp();
    const req = new Request('http://localhost/');
    const res = await handler.fetch(req, env, {} as ExecutionContext);

    expect(res.status).toBe(200);
    // Must not be overridden with immutable.
    const cc = res.headers.get('cache-control');
    expect(cc).not.toBe(IMMUTABLE_CC);
    if (cc !== null) {
      expect(cc).not.toContain('max-age=31536000');
    }
  });

  test('GET /index.html → does NOT get immutable Cache-Control override', async () => {
    const { env } = createMockEnv();
    env.ASSETS = {
      fetch: async (_req: RequestInfo | URL) =>
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    } as unknown as Fetcher;

    const handler = await importApp();
    const req = new Request('http://localhost/index.html');
    const res = await handler.fetch(req, env, {} as ExecutionContext);

    expect(res.status).toBe(200);
    const cc = res.headers.get('cache-control');
    expect(cc).not.toBe(IMMUTABLE_CC);
    if (cc !== null) {
      expect(cc).not.toContain('max-age=31536000');
    }
  });
});
