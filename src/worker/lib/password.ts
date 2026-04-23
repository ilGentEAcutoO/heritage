/**
 * password.ts — scrypt-based password hashing for Cloudflare Workers
 *
 * Uses node:crypto.scryptSync (native via nodejs_compat) with a per-user random salt.
 * Timing-safe comparison via node:crypto.timingSafeEqual.
 */

import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 64;
export const SCRYPT_SALT_BYTES = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PasswordHash {
  /** Hex-encoded derived key (SCRYPT_KEYLEN bytes → SCRYPT_KEYLEN * 2 hex chars) */
  hash: string;
  /** Hex-encoded random salt (SCRYPT_SALT_BYTES → SCRYPT_SALT_BYTES * 2 hex chars) */
  salt: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SCRYPT_OPTS = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P } as const;

/**
 * Constant dummy salt used by dummyVerifyPassword — must be exactly SCRYPT_SALT_BYTES
 * bytes of hex (i.e. SCRYPT_SALT_BYTES * 2 hex chars).
 */
const DUMMY_SALT_HEX = '0'.repeat(SCRYPT_SALT_BYTES * 2);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Hash a plaintext password using scrypt with a freshly generated random salt.
 * @returns hex-encoded hash + salt, ready to write to users.password_hash / users.password_salt
 */
export async function hashPassword(plain: string): Promise<PasswordHash> {
  const saltBuf = randomBytes(SCRYPT_SALT_BYTES);
  const hashBuf = scryptSync(plain, saltBuf, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return {
    hash: hashBuf.toString('hex'),
    salt: saltBuf.toString('hex'),
  };
}

/**
 * Verify a plaintext password against a stored hash+salt using timing-safe comparison.
 * Returns false on any error (bad hex, mismatched length, etc.) — never throws on a normal
 * wrong-password path.
 */
export async function verifyPassword(
  plain: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  try {
    const saltBuf = Buffer.from(storedSalt, 'hex');
    // Guard: salt must decode to exactly SCRYPT_SALT_BYTES bytes
    if (saltBuf.length !== SCRYPT_SALT_BYTES) {
      return false;
    }
    const storedBuf = Buffer.from(storedHash, 'hex');
    // Guard: stored hash must decode to exactly SCRYPT_KEYLEN bytes
    if (storedBuf.length !== SCRYPT_KEYLEN) {
      return false;
    }
    const candidateBuf = scryptSync(plain, saltBuf, SCRYPT_KEYLEN, SCRYPT_OPTS);
    return timingSafeEqual(candidateBuf, storedBuf);
  } catch {
    return false;
  }
}

/**
 * Perform a dummy scrypt run with the same params as verifyPassword.
 * Call this in the login handler when the email is unknown — it consumes comparable CPU
 * time so an attacker cannot distinguish "unknown email" from "wrong password" via timing.
 */
export async function dummyVerifyPassword(plain: string): Promise<void> {
  const saltBuf = Buffer.from(DUMMY_SALT_HEX, 'hex');
  const result = scryptSync(plain, saltBuf, SCRYPT_KEYLEN, SCRYPT_OPTS);
  // timingSafeEqual consumes a tiny bit of extra time — keep it for interface parity
  timingSafeEqual(result, result);
}
