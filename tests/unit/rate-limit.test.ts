import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '../../src/worker/lib/rate-limit';

function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
  } as unknown as KVNamespace;
}

describe('checkRateLimit', () => {
  it('allows up to max, then rejects within the same window', async () => {
    const kv = makeKv();
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(await checkRateLimit(kv, 'photo-mutate', 'user1', 3, 60));
    }
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('gives independent budgets to different keys', async () => {
    const kv = makeKv();
    expect(await checkRateLimit(kv, 'photo-mutate', 'a', 1, 60)).toBe(true);
    expect(await checkRateLimit(kv, 'photo-mutate', 'a', 1, 60)).toBe(false);
    // different subject → its own budget
    expect(await checkRateLimit(kv, 'photo-mutate', 'b', 1, 60)).toBe(true);
  });

  it('gives independent budgets to different buckets', async () => {
    const kv = makeKv();
    expect(await checkRateLimit(kv, 'photo-mutate', 'a', 1, 60)).toBe(true);
    expect(await checkRateLimit(kv, 'photo-mutate', 'a', 1, 60)).toBe(false);
    // same subject, different bucket → its own budget
    expect(await checkRateLimit(kv, 'tree-create', 'a', 1, 60)).toBe(true);
  });
});
