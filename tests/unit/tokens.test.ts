import { describe, it, expect } from 'vitest';
import { createSessionToken, createEmailToken, hashToken, TOKEN_BYTES } from '../../src/worker/lib/tokens';

describe('createSessionToken / createEmailToken', () => {
  it('has TOKEN_BYTES = 32 (256-bit)', () => {
    expect(TOKEN_BYTES).toBe(32);
  });
  it('raw is URL-safe base64 (no +, /, or =)', () => {
    const { raw } = createSessionToken();
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('raw decodes to 32 bytes', () => {
    const { raw } = createSessionToken();
    // Base64url → ceil(32*4/3) = 43 chars no padding
    expect(raw.length).toBe(43);
  });
  it('hash is 64 lowercase hex chars', () => {
    const { hash } = createSessionToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('hashToken(raw) === hash for a freshly generated pair', () => {
    const { raw, hash } = createSessionToken();
    expect(hashToken(raw)).toBe(hash);
  });
  it('two tokens are overwhelmingly unlikely to collide', () => {
    const a = createSessionToken();
    const b = createSessionToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
  it('createEmailToken uses the same shape', () => {
    const { raw, hash } = createEmailToken();
    expect(raw.length).toBe(43);
    expect(hash.length).toBe(64);
    expect(hashToken(raw)).toBe(hash);
  });
});

describe('hashToken', () => {
  it('is deterministic', () => {
    expect(hashToken('my-token')).toBe(hashToken('my-token'));
  });
  it('changes on any input change', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });
  it('produces 64-char hex for any input', () => {
    expect(hashToken('')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('x'.repeat(10000))).toMatch(/^[0-9a-f]{64}$/);
  });
  // Canonical SHA-256 test vector (NIST): empty string → e3b0c44298fc1c149afbf4c8996fb924...
  it('matches the SHA-256 NIST test vector for the empty string', () => {
    expect(hashToken('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('matches the SHA-256 NIST test vector for "abc"', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('entropy spot-check (probabilistic)', () => {
  it('no duplicates across 1000 tokens', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(createSessionToken().raw);
    expect(set.size).toBe(1000);
  });
});
