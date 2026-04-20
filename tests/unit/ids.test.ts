import { describe, it, expect } from 'vitest';
import { newId, newUuid } from '@worker/lib/ids';

describe('newId()', () => {
  it('returns a 26-character string', () => {
    const id = newId();
    expect(id).toHaveLength(26);
  });

  it('matches Crockford base32 pattern /^[0-9A-Z]{26}$/', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it('produces 10_000 distinct values from 10_000 calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      ids.add(newId());
    }
    expect(ids.size).toBe(10_000);
  });
});

describe('newUuid()', () => {
  it('returns an RFC-4122 v4 UUID', () => {
    const uuid = newUuid();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
