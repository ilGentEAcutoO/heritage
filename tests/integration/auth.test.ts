/**
 * Integration tests for the magic-link auth flow.
 *
 * We drive the Hono app via `app.fetch(request, env, ctx)` with the mock Env
 * from tests/helpers/mock-env.ts. No miniflare, no wrangler — just the real
 * route handlers against a SQLite-backed D1 shim.
 *
 * Flow covered end-to-end:
 *   1. POST /api/auth/request → 204 + auth_tokens row + EMAIL.send called
 *   2. Extract magic URL → GET /api/auth/verify?tk=... → 302 + Set-Cookie
 *   3. GET /api/auth/me with cookie → { user }
 *   4. POST /api/auth/logout → 204 + session row deleted + cookie cleared
 *
 * Plus error/abuse cases:
 *   - CSRF origin enforcement on POSTs
 *   - Rate-limit: 3 magic-links per hour per email
 *   - Verify with used token / expired token
 *   - /me without cookie → 401
 */
import { describe, test, expect } from 'vitest';
import { createMockEnv, type MockEnvHandle } from '../helpers/mock-env';
import { verifyToken, sha256Hash } from '../../src/worker/lib/tokens';

// Import the app lazily inside helpers so each test can re-import with a fresh env if needed.
async function importApp() {
  const mod = await import('../../src/worker/index');
  // The file's default export is { fetch }. We want the inner Hono app, but since
  // index.ts doesn't export it, we instead invoke the default fetch handler with the env.
  return mod.default;
}

const APP_URL = 'http://localhost:5173';

function mkEnv(): MockEnvHandle {
  return createMockEnv({ appUrl: APP_URL });
}

function csrfHeaders(): HeadersInit {
  return { 'content-type': 'application/json', origin: APP_URL };
}

async function request(
  envHandle: MockEnvHandle,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const handler = await importApp();
  const url = new URL(input, APP_URL).toString();
  const req = new Request(url, init);
  return handler.fetch(req, envHandle.env, {} as ExecutionContext);
}

function extractMagicLink(emailSpy: MockEnvHandle['emailSpy']): string {
  const last = emailSpy.calls.at(-1);
  if (!last) throw new Error('no email sent');
  const html = last.html ?? '';
  const m = html.match(/href="([^"]+)"/);
  if (!m) throw new Error('no href in html email body');
  return m[1]!;
}

function cookieFrom(setCookie: string | null): string | null {
  if (!setCookie) return null;
  // "heritage_session=abc...; HttpOnly; Secure; ..."
  const first = setCookie.split(';')[0];
  return first ?? null;
}

// ---------------------------------------------------------------------------

describe('auth — /api/auth/request', () => {
  test('valid email → 204, token row inserted, email sent with magic URL', async () => {
    const h = mkEnv();
    const res = await request(h, '/api/auth/request', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ email: 'alice@example.com' }),
    });
    expect(res.status).toBe(204);

    // One auth_token row was written.
    const rows = h.d1._sqlite
      .prepare('SELECT email, expires_at, used_at, token_hash FROM auth_tokens')
      .all() as Array<{
      email: string;
      expires_at: number;
      used_at: number | null;
      token_hash: string;
    }>;
    expect(rows.length).toBe(1);
    expect(rows[0].email).toBe('alice@example.com');
    expect(rows[0].used_at).toBeNull();
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);

    // Exactly one email was sent.
    expect(h.emailSpy.calls.length).toBe(1);
    expect(h.emailSpy.calls[0].to).toBe('alice@example.com');
    expect(h.emailSpy.calls[0].html).toContain(`${APP_URL}/api/auth/verify?tk=`);

    // The signed token in the URL should round-trip.
    const magic = extractMagicLink(h.emailSpy);
    const tk = new URL(magic).searchParams.get('tk')!;
    const payload = verifyToken(h.env.SESSION_SECRET, tk);
    expect(payload).not.toBeNull();
    expect(payload!.email).toBe('alice@example.com');
    // And its sha256(nonce) must match the DB row.
    expect(sha256Hash(payload!.nonce)).toBe(rows[0].token_hash);
  });

  test('lowercases + trims email before storing', async () => {
    const h = mkEnv();
    const res = await request(h, '/api/auth/request', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ email: '  Alice@Example.COM  ' }),
    });
    expect(res.status).toBe(204);
    const row = h.d1._sqlite
      .prepare('SELECT email FROM auth_tokens')
      .get() as { email: string };
    expect(row?.email).toBe('alice@example.com');
  });

  test('malformed email → 400 and no email sent', async () => {
    const h = mkEnv();
    const res = await request(h, '/api/auth/request', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
    expect(h.emailSpy.calls.length).toBe(0);
  });

  test('missing Origin → 403 (CSRF)', async () => {
    const h = mkEnv();
    const res = await request(h, '/api/auth/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com' }),
    });
    expect(res.status).toBe(403);
  });

  test('wrong Origin → 403 (CSRF)', async () => {
    const h = mkEnv();
    const res = await request(h, '/api/auth/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ email: 'a@b.com' }),
    });
    expect(res.status).toBe(403);
  });

  test('rate-limited to 3 per hour per email — 4th call is 429', async () => {
    const h = mkEnv();
    for (let i = 0; i < 3; i++) {
      const res = await request(h, '/api/auth/request', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ email: 'floody@example.com' }),
      });
      expect(res.status).toBe(204);
    }
    const res4 = await request(h, '/api/auth/request', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ email: 'floody@example.com' }),
    });
    expect(res4.status).toBe(429);
    const body = await res4.json();
    expect(body).toEqual(
      expect.objectContaining({ error: 'rate_limited' }),
    );
    expect(res4.headers.get('retry-after')).not.toBeNull();
    // Only 3 emails went out.
    expect(h.emailSpy.calls.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------

describe('auth — /api/auth/verify', () => {
  async function requestMagic(h: MockEnvHandle, email: string): Promise<string> {
    await request(h, '/api/auth/request', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ email }),
    });
    return extractMagicLink(h.emailSpy);
  }

  test('valid token → 302 + Set-Cookie HttpOnly/Secure/SameSite=Lax with Max-Age', async () => {
    const h = mkEnv();
    const magic = await requestMagic(h, 'bob@example.com');
    const verifyPath = new URL(magic).pathname + new URL(magic).search;

    const res = await request(h, verifyPath, { method: 'GET' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/tree/mine');

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('heritage_session=');
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('secure');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    expect(setCookie.toLowerCase()).toContain('path=/');
    expect(setCookie.toLowerCase()).toContain('max-age=2592000');

    // The auth_token is marked used.
    const row = h.d1._sqlite
      .prepare('SELECT used_at FROM auth_tokens WHERE email = ?')
      .get('bob@example.com') as { used_at: number | null };
    expect(row.used_at).not.toBeNull();

    // A session row exists for the new user.
    const sess = h.d1._sqlite
      .prepare(
        "SELECT s.id, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = ?",
      )
      .get('bob@example.com') as { id: string; expires_at: number } | undefined;
    expect(sess).toBeDefined();
    expect(sess!.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test('used token → 302 /login?err=invalid (single-use)', async () => {
    const h = mkEnv();
    const magic = await requestMagic(h, 'carol@example.com');
    const verifyPath = new URL(magic).pathname + new URL(magic).search;

    const first = await request(h, verifyPath, { method: 'GET' });
    expect(first.status).toBe(302);

    const second = await request(h, verifyPath, { method: 'GET' });
    expect(second.status).toBe(302);
    expect(second.headers.get('location')).toBe('/login?err=invalid');
  });

  test('tampered token → 302 /login?err=invalid', async () => {
    const h = mkEnv();
    const magic = await requestMagic(h, 'dave@example.com');
    const u = new URL(magic);
    const tk = u.searchParams.get('tk')!;
    // Flip a char in the body portion.
    const [body, mac] = tk.split('.');
    const tamperedBody = body!.slice(0, -1) + (body!.at(-1) === 'A' ? 'B' : 'A');
    u.searchParams.set('tk', `${tamperedBody}.${mac}`);

    const res = await request(h, u.pathname + u.search, { method: 'GET' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?err=invalid');
  });

  test('expired token (DB row past expires_at) → /login?err=invalid', async () => {
    const h = mkEnv();
    const magic = await requestMagic(h, 'eve@example.com');

    // Back-date the DB row to simulate a token that expired while sitting in inbox.
    h.d1._sqlite
      .prepare('UPDATE auth_tokens SET expires_at = ? WHERE email = ?')
      .run(Math.floor(Date.now() / 1000) - 60, 'eve@example.com');

    const u = new URL(magic);
    const res = await request(h, u.pathname + u.search, { method: 'GET' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?err=invalid');
  });

  test('missing tk param → /login?err=invalid', async () => {
    const h = mkEnv();
    const res = await request(h, '/api/auth/verify', { method: 'GET' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?err=invalid');
  });

  test('returning user: verify creates a NEW session (rotation)', async () => {
    const h = mkEnv();
    // First login
    const magic1 = await requestMagic(h, 'frank@example.com');
    const u1 = new URL(magic1);
    await request(h, u1.pathname + u1.search, { method: 'GET' });

    // Second login
    const magic2 = await requestMagic(h, 'frank@example.com');
    const u2 = new URL(magic2);
    await request(h, u2.pathname + u2.search, { method: 'GET' });

    const rows = h.d1._sqlite
      .prepare(
        'SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = ?',
      )
      .all('frank@example.com') as Array<{ id: string }>;
    expect(rows.length).toBe(2);
    expect(rows[0].id).not.toBe(rows[1].id);

    // And only one user row exists.
    const userCount = h.d1._sqlite
      .prepare('SELECT COUNT(*) as c FROM users WHERE email = ?')
      .get('frank@example.com') as { c: number };
    expect(userCount.c).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('auth — /api/auth/me + /logout', () => {
  async function loginAndGetCookie(h: MockEnvHandle, email: string): Promise<string> {
    await request(h, '/api/auth/request', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ email }),
    });
    const magic = extractMagicLink(h.emailSpy);
    const u = new URL(magic);
    const res = await request(h, u.pathname + u.search, { method: 'GET' });
    const sc = res.headers.get('set-cookie');
    const c = cookieFrom(sc);
    if (!c) throw new Error('no cookie returned from verify');
    return c;
  }

  test('/me without cookie → 401', async () => {
    const h = mkEnv();
    const res = await request(h, '/api/auth/me', { method: 'GET' });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'unauthenticated' });
  });

  test('/me with valid cookie → 200 + user', async () => {
    const h = mkEnv();
    const cookie = await loginAndGetCookie(h, 'grace@example.com');
    const res = await request(h, '/api/auth/me', {
      method: 'GET',
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string; id: string } };
    expect(body.user.email).toBe('grace@example.com');
    expect(body.user.id).toBeTruthy();
  });

  test('/me with bogus cookie → 401 (no session matches)', async () => {
    const h = mkEnv();
    const res = await request(h, '/api/auth/me', {
      method: 'GET',
      headers: { cookie: 'heritage_session=not-a-real-id' },
    });
    expect(res.status).toBe(401);
  });

  test('/logout deletes session row + clears cookie', async () => {
    const h = mkEnv();
    const cookie = await loginAndGetCookie(h, 'henry@example.com');

    // Confirm the session exists.
    const before = h.d1._sqlite
      .prepare('SELECT COUNT(*) as c FROM sessions')
      .get() as { c: number };
    expect(before.c).toBe(1);

    const res = await request(h, '/api/auth/logout', {
      method: 'POST',
      headers: { cookie, origin: APP_URL },
    });
    expect(res.status).toBe(204);
    const sc = res.headers.get('set-cookie') ?? '';
    // Clearing uses Max-Age=0 or expired date — presence of the cookie name with Max-Age=0 is canonical.
    expect(sc).toContain('heritage_session=');
    expect(sc.toLowerCase()).toMatch(/max-age=0|expires=/i);

    // Session row is gone.
    const after = h.d1._sqlite
      .prepare('SELECT COUNT(*) as c FROM sessions')
      .get() as { c: number };
    expect(after.c).toBe(0);

    // /me now returns 401 even with the old cookie.
    const meAfter = await request(h, '/api/auth/me', {
      method: 'GET',
      headers: { cookie },
    });
    expect(meAfter.status).toBe(401);
  });
});
