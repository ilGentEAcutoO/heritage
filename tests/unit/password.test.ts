import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, dummyVerifyPassword, SCRYPT_SALT_BYTES, SCRYPT_KEYLEN } from '../../src/worker/lib/password';

describe('hashPassword', () => {
  it('returns hex hash and salt of expected length', async () => {
    const { hash, salt } = await hashPassword('hunter2-super-long');
    expect(salt).toMatch(/^[0-9a-f]+$/);
    expect(salt.length).toBe(SCRYPT_SALT_BYTES * 2);
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(hash.length).toBe(SCRYPT_KEYLEN * 2);
  });
  it('produces different salts for identical inputs', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const { hash, salt } = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash, salt)).toBe(true);
  });
  it('returns false for wrong password', async () => {
    const { hash, salt } = await hashPassword('real-password');
    expect(await verifyPassword('fake-password', hash, salt)).toBe(false);
  });
  it('returns false on malformed hex (doesn\'t throw)', async () => {
    expect(await verifyPassword('x', 'not-hex-zzz', 'also-not-hex')).toBe(false);
  });
  it('returns false on wrong-length hash', async () => {
    const { salt } = await hashPassword('x');
    expect(await verifyPassword('x', 'deadbeef', salt)).toBe(false);
  });
});

describe('dummyVerifyPassword', () => {
  it('resolves without throwing', async () => {
    await expect(dummyVerifyPassword('anything')).resolves.toBeUndefined();
  });
  it('takes roughly the same wall-clock time as verifyPassword', async () => {
    // Warm up JIT first
    const { hash, salt } = await hashPassword('warmup-password');
    await verifyPassword('warmup-password', hash, salt);
    await dummyVerifyPassword('warmup-password');

    const realStart = performance.now();
    await verifyPassword('correct-password', hash, salt);
    const realMs = performance.now() - realStart;

    const dummyStart = performance.now();
    await dummyVerifyPassword('whatever');
    const dummyMs = performance.now() - dummyStart;

    // Allow 3x spread — scrypt has some variance. Test should catch a 10x gap.
    const ratio = Math.max(realMs, dummyMs) / Math.min(realMs, dummyMs);
    expect(ratio).toBeLessThan(3);
  });
});
