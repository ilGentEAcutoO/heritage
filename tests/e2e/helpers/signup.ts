/**
 * signup.ts — E2E helper to create a verified user via the signup+verify
 * backchannel.
 *
 * The real /api/auth/signup flow sends a verify token by email; we don't have
 * inbox access in CI. Instead, we:
 *
 * 1. POST /api/auth/signup with the test email via page.request, so the
 *    server creates the user row and stores a random token hash it generated.
 * 2. Generate our OWN raw token locally (randomBase64url(32)) and its
 *    sha256-hex hash; UPDATE auth_tokens for this email to use the hash we
 *    control. The raw token was discarded by the server; only our new hash
 *    and the known raw token survive.
 * 3. POST /api/auth/verify with our raw token — server hashes, compares,
 *    matches, sets used_at atomically, issues the session cookie.
 *
 * Net effect: the spec gets a verified user + an authenticated page.request
 * context without touching an email inbox and without any test-only
 * production endpoint.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { escapeSqlString, execSql } from './d1';

function randomBase64url(len = 32): string {
  return randomBytes(len).toString('base64url');
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface SignupHelperResult {
  email: string;
  password: string;
  userId: string;
}

/**
 * Create a verified user. `request` is a Playwright APIRequestContext (either
 * from `page.request` or `browser.newContext().request`). The session cookie
 * ends up attached to that context.
 */
export async function signupAndVerifyViaBackchannel(
  request: APIRequestContext,
  email: string,
  password: string,
  displayName?: string,
): Promise<SignupHelperResult> {
  // Step 1 — POST /api/auth/signup (creates user + a server-generated token)
  const signupBody: { email: string; password: string; displayName?: string } = {
    email,
    password,
  };
  if (displayName) signupBody.displayName = displayName;

  const signupRes = await request.post('/api/auth/signup', {
    data: signupBody,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!signupRes.ok()) {
    const txt = await signupRes.text();
    throw new Error(`signup failed: ${signupRes.status()} ${txt}`);
  }

  // Step 2 — generate our own raw token + hash; overwrite the server's row.
  const raw = randomBase64url(32);
  const hash = sha256Hex(raw);
  const esc = escapeSqlString(email);

  // Overwrite the most-recent unused verify token for this email with OUR hash.
  execSql(
    `UPDATE auth_tokens SET token_hash = '${hash}' WHERE id = (SELECT id FROM auth_tokens WHERE email = '${esc}' AND kind = 'verify' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1)`,
  );

  // Step 3 — POST /api/auth/verify with our raw token.
  const verifyRes = await request.post('/api/auth/verify', {
    data: { token: raw },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!verifyRes.ok()) {
    const txt = await verifyRes.text();
    throw new Error(`verify failed: ${verifyRes.status()} ${txt}`);
  }
  const verifyBody = (await verifyRes.json()) as { user: { id: string } };

  return { email, password, userId: verifyBody.user.id };
}

/**
 * Variant for when the caller wants to go through the UI verify route for a
 * spec (e.g. S5). Returns the raw token so the spec can navigate to
 * /auth/verify?token=…
 */
export async function signupAndMintRawVerifyToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ raw: string }> {
  const signupRes = await request.post('/api/auth/signup', {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!signupRes.ok()) {
    const txt = await signupRes.text();
    throw new Error(`signup failed: ${signupRes.status()} ${txt}`);
  }

  const raw = randomBase64url(32);
  const hash = sha256Hex(raw);
  const esc = escapeSqlString(email);

  execSql(
    `UPDATE auth_tokens SET token_hash = '${hash}' WHERE id = (SELECT id FROM auth_tokens WHERE email = '${esc}' AND kind = 'verify' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1)`,
  );

  return { raw };
}

/**
 * Mint a fresh reset token for a verified user and return the raw token.
 * (Used by S11 — reset-confirm happy path.)
 */
export async function requestResetAndMintRawToken(
  request: APIRequestContext,
  email: string,
): Promise<{ raw: string }> {
  // Server returns 204 regardless; creates a reset row in auth_tokens for the
  // existing user (or silently succeeds for unknown email — caller must have
  // created the user already).
  await request.post('/api/auth/request-reset', {
    data: { email },
    headers: { 'Content-Type': 'application/json' },
  });

  const raw = randomBase64url(32);
  const hash = sha256Hex(raw);
  const esc = escapeSqlString(email);

  execSql(
    `UPDATE auth_tokens SET token_hash = '${hash}' WHERE id = (SELECT id FROM auth_tokens WHERE email = '${esc}' AND kind = 'reset' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1)`,
  );

  return { raw };
}

/**
 * Small utility — build a unique e2e email so specs don't collide.
 */
export function makeE2EEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
}

/** Re-export for spec convenience. */
export { sha256Hex, randomBase64url };
