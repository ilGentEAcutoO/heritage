import { sha256 } from '@oslojs/crypto/sha2';

export interface TokenPair {
  raw: string;  // URL-safe base64, no padding, ~43 chars for 32 bytes
  hash: string; // 64 hex chars (sha256 → hex lowercase)
}

/** Number of random bytes used to build a token. Exported for tests / future tuning. */
export const TOKEN_BYTES = 32;

function generateTokenPair(): TokenPair {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const raw = Buffer.from(bytes).toString('base64url');
  const hash = hashToken(raw);
  return { raw, hash };
}

/**
 * Generate a new opaque session token pair (256-bit entropy).
 * Use this on login/signup-verify success. Cookie carries `raw`; DB stores `hash`.
 */
export function createSessionToken(): TokenPair {
  return generateTokenPair();
}

/**
 * Generate a new email token (verify or reset). Identical crypto to session tokens —
 * separate helper for call-site readability.
 */
export function createEmailToken(): TokenPair {
  return generateTokenPair();
}

/**
 * Compute the sha256 hex-lowercase of a raw token. Use this on the server side to look up
 * a token by its stored hash when you only have the raw token from a cookie or URL.
 * @param raw the raw token string (as sent to the client)
 * @returns 64-char hex lowercase sha256
 */
export function hashToken(raw: string): string {
  const bytes = new TextEncoder().encode(raw);
  const hashBytes = sha256(bytes);
  return Buffer.from(hashBytes).toString('hex');
}
