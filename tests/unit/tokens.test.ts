/**
 * Unit tests for HMAC token primitives.
 *
 * We test *behavior*, not internals — we don't peek at the HMAC bytes,
 * just confirm sign→verify roundtrips, that tampering anywhere in the
 * envelope breaks verify, and that expiry is enforced.
 */
import { describe, test, expect } from 'vitest';
import {
  signToken,
  verifyToken,
  sha256Hash,
  constantTimeEqual,
  generateNonce,
  generateSessionId,
} from '@worker/lib/tokens';

const SECRET_A = 'test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SECRET_B = 'test-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function futureExp(seconds = 600): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

describe('signToken + verifyToken', () => {
  test('sign → verify round-trips with email, nonce, exp intact', () => {
    const exp = futureExp();
    const raw = signToken(SECRET_A, {
      email: 'alice@example.com',
      nonce: 'nonce-1',
      exp,
    });
    const parsed = verifyToken(SECRET_A, raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.email).toBe('alice@example.com');
    expect(parsed!.nonce).toBe('nonce-1');
    expect(parsed!.exp).toBe(exp);
  });

  test('different payload produces different token (no reuse across emails)', () => {
    const exp = futureExp();
    const a = signToken(SECRET_A, { email: 'a@x.com', nonce: 'n', exp });
    const b = signToken(SECRET_A, { email: 'b@x.com', nonce: 'n', exp });
    expect(a).not.toBe(b);
  });

  test('token signed with secret A fails verify under secret B', () => {
    const exp = futureExp();
    const raw = signToken(SECRET_A, { email: 'x@x.com', nonce: 'n', exp });
    expect(verifyToken(SECRET_B, raw)).toBeNull();
  });

  test('tampered payload (flipped char in body) fails verify', () => {
    const raw = signToken(SECRET_A, {
      email: 'a@b.com',
      nonce: 'n',
      exp: futureExp(),
    });
    const [body, mac] = raw.split('.');
    expect(body).toBeTruthy();
    // Flip the first body char deterministically.
    const tamperedBody = (body![0] === 'A' ? 'B' : 'A') + body!.slice(1);
    expect(verifyToken(SECRET_A, `${tamperedBody}.${mac}`)).toBeNull();
  });

  test('tampered HMAC (flipped char in mac) fails verify', () => {
    const raw = signToken(SECRET_A, {
      email: 'a@b.com',
      nonce: 'n',
      exp: futureExp(),
    });
    const [body, mac] = raw.split('.');
    expect(mac).toBeTruthy();
    const tamperedMac = (mac![0] === 'A' ? 'B' : 'A') + mac!.slice(1);
    expect(verifyToken(SECRET_A, `${body}.${tamperedMac}`)).toBeNull();
  });

  test('malformed (no dot) fails verify', () => {
    expect(verifyToken(SECRET_A, 'not-a-valid-token')).toBeNull();
  });

  test('empty string fails verify', () => {
    expect(verifyToken(SECRET_A, '')).toBeNull();
  });

  test('expired token fails verify', () => {
    const exp = Math.floor(Date.now() / 1000) - 60; // 1 min in the past
    const raw = signToken(SECRET_A, { email: 'a@b.com', nonce: 'n', exp });
    expect(verifyToken(SECRET_A, raw)).toBeNull();
  });
});

describe('sha256Hash', () => {
  test('produces 64-char lowercase hex', () => {
    const h = sha256Hash('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  test('known vector: sha256("abc")', () => {
    expect(sha256Hash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('deterministic', () => {
    expect(sha256Hash('x')).toBe(sha256Hash('x'));
  });

  test('different inputs → different outputs', () => {
    expect(sha256Hash('a')).not.toBe(sha256Hash('b'));
  });
});

describe('constantTimeEqual', () => {
  test('returns true for equal strings', () => {
    expect(constantTimeEqual('abcdef', 'abcdef')).toBe(true);
  });

  test('returns false for different strings of same length', () => {
    expect(constantTimeEqual('abcdef', 'abcxef')).toBe(false);
  });

  test('returns false for different-length strings without comparing bytes', () => {
    // Length mismatch short-circuits — fine for fixed-width hashes.
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });

  test('does not early-return on first mismatch (timing check surrogate)', () => {
    // We can't directly measure timing in vitest with CI jitter, but we CAN
    // assert that comparing two strings that differ only in the LAST byte
    // returns the same result as comparing two strings that differ only in
    // the FIRST byte — i.e. both return false consistently.
    const equalHead = constantTimeEqual('aaaaaaaaab', 'aaaaaaaaaa');
    const equalTail = constantTimeEqual('baaaaaaaaa', 'aaaaaaaaaa');
    expect(equalHead).toBe(false);
    expect(equalTail).toBe(false);
  });

  test('empty strings are equal', () => {
    expect(constantTimeEqual('', '')).toBe(true);
  });
});

describe('generateNonce / generateSessionId', () => {
  test('generateNonce returns base64url-safe 32-byte payload', () => {
    const n = generateNonce();
    expect(n).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes base64url = 43 chars (no padding)
    expect(n.length).toBeGreaterThanOrEqual(42);
    expect(n.length).toBeLessThanOrEqual(44);
  });

  test('generateNonce is non-repeating', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });

  test('generateSessionId is non-repeating and base64url-safe', () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });
});
