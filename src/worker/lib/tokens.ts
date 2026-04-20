/**
 * Token primitives — HMAC-signed magic-link tokens, SHA-256 hashing, and
 * constant-time comparisons. Web Crypto + @oslojs/crypto only, never Node crypto.
 *
 * Magic-link token format:
 *   base64url(JSON(payload)) + "." + base64url(hmac_sha256(secret, bodyPart))
 *
 * We HMAC the base64url-encoded body (a canonical ASCII string) so verification
 * cannot be fooled by alternate JSON encodings of the same payload.
 *
 * The nonce inside the payload is the raw secret presented to /auth/verify.
 * In the DB we only store sha256(nonce) to avoid leaking valid tokens
 * on DB dump — an attacker with read-only DB access cannot forge a link.
 */
import { hmac } from '@oslojs/crypto/hmac';
import { SHA256, sha256 } from '@oslojs/crypto/sha2';
import { constantTimeEqual as bytesEqual } from '@oslojs/crypto/subtle';

export interface TokenPayload {
  email: string;
  nonce: string;
  exp: number; // unix seconds
}

// ---------------------------------------------------------------------------
// base64url (RFC 4648, no padding) — Workers has no Buffer. TextEncoder + btoa
// gives us ASCII safely; we then swap characters and strip `=`.
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function stringToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytesToString(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sign a token: returns `<base64url(payload)>.<base64url(hmac)>`.
 *
 * The HMAC covers the base64url-encoded payload so verification compares a
 * canonical byte-for-byte string and is immune to JSON re-encoding games.
 */
export function signToken(secret: string, payload: TokenPayload): string {
  if (!secret) throw new Error('signToken: secret must be non-empty');
  const bodyJson = JSON.stringify({
    email: payload.email,
    nonce: payload.nonce,
    exp: payload.exp,
  });
  const body = bytesToBase64Url(stringToBytes(bodyJson));
  const mac = hmac(SHA256, stringToBytes(secret), stringToBytes(body));
  return `${body}.${bytesToBase64Url(mac)}`;
}

/**
 * Verify a signed token and return its payload or null on any failure.
 *
 * Failure modes (all return null, intentionally indistinguishable):
 *   - malformed
 *   - bad HMAC (including tampered payload or tampered mac)
 *   - expired
 *   - payload missing required fields
 *
 * The HMAC compare is constant-time.
 */
export function verifyToken(secret: string, raw: string): TokenPayload | null {
  if (!secret || typeof raw !== 'string') return null;
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot === raw.length - 1) return null;
  const body = raw.slice(0, dot);
  const macB64 = raw.slice(dot + 1);

  let presentedMac: Uint8Array;
  try {
    presentedMac = base64UrlToBytes(macB64);
  } catch {
    return null;
  }

  const expectedMac = hmac(SHA256, stringToBytes(secret), stringToBytes(body));
  if (presentedMac.byteLength !== expectedMac.byteLength) return null;
  if (!bytesEqual(presentedMac, expectedMac)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(bytesToString(base64UrlToBytes(body)));
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as TokenPayload).email !== 'string' ||
    typeof (payload as TokenPayload).nonce !== 'string' ||
    typeof (payload as TokenPayload).exp !== 'number'
  ) {
    return null;
  }

  const p = payload as TokenPayload;
  const now = Math.floor(Date.now() / 1000);
  if (p.exp < now) return null;

  return p;
}

/**
 * SHA-256 → lowercase hex. Used for storing token/session hashes in D1.
 */
export function sha256Hash(input: string): string {
  return bytesToHex(sha256(stringToBytes(input)));
}

/**
 * Constant-time string equality (ASCII-safe). Used whenever comparing a
 * presented hash against a DB-stored hash, to avoid timing side-channels.
 *
 * Length mismatch returns false immediately — this reveals length only,
 * which is fine for fixed-width hashes (sha256 hex is always 64 chars).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = stringToBytes(a);
  const bb = stringToBytes(b);
  return bytesEqual(ab, bb);
}

/**
 * Generate a 32-byte random nonce, base64url-encoded (43 chars). Used as the
 * secret material inside magic-link tokens.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/**
 * Generate a 32-byte random session id, base64url-encoded. This is the value
 * stored in the HttpOnly cookie; its sha256 hash is what we store in D1.
 */
export function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}
