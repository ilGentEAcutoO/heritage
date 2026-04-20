/**
 * storage.test.ts
 * Unit tests for src/app/lib/storage.ts — readLocal / writeLocal helpers.
 * Runs in node environment; localStorage is shimmed manually.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';

// ── localStorage shim ─────────────────────────────────────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
};

vi.stubGlobal('window', {
  localStorage: localStorageMock,
} as unknown as Window);
vi.stubGlobal('localStorage', localStorageMock);

// Import AFTER globals are stubbed so module-level hasStorage() sees them.
const { readLocal, writeLocal } = await import('@app/lib/storage');

const TestSchema = z.object({ name: z.string(), age: z.number() });
type TestShape = z.infer<typeof TestSchema>;

const VALID: TestShape = { name: 'Alice', age: 30 };
const KEY = 'test-key';

beforeEach(() => localStorageMock.clear());
afterEach(() => localStorageMock.clear());

// ─────────────────────────────────────────────────────────────────────────────
describe('readLocal', () => {
  test('returns parsed+validated value for valid JSON with correct shape', () => {
    localStorageMock.setItem(KEY, JSON.stringify(VALID));
    expect(readLocal(KEY, TestSchema)).toEqual(VALID);
  });

  test('returns null for missing key', () => {
    expect(readLocal(KEY, TestSchema)).toBeNull();
  });

  test('returns null and removes key for valid JSON with invalid shape', () => {
    localStorageMock.setItem(KEY, JSON.stringify({ name: 'Bob' })); // missing age
    expect(readLocal(KEY, TestSchema)).toBeNull();
    expect(localStorageMock.getItem(KEY)).toBeNull();
  });

  test('returns null and removes key for invalid JSON', () => {
    localStorageMock.setItem(KEY, '{not valid json');
    expect(readLocal(KEY, TestSchema)).toBeNull();
    expect(localStorageMock.getItem(KEY)).toBeNull();
  });

  test('returns null and removes key for extra properties rejected by strict schema', () => {
    const StrictSchema = TestSchema.strict();
    localStorageMock.setItem(KEY, JSON.stringify({ ...VALID, injected: 'bad' }));
    expect(readLocal(KEY, StrictSchema)).toBeNull();
    expect(localStorageMock.getItem(KEY)).toBeNull();
  });

  test('returns null without throwing when localStorage is unavailable (SSR)', () => {
    const original = (globalThis as unknown as { window: unknown }).window;
    // Simulate SSR: window.localStorage throws
    (globalThis as unknown as { window: unknown }).window = undefined;
    expect(() => readLocal(KEY, TestSchema)).not.toThrow();
    expect(readLocal(KEY, TestSchema)).toBeNull();
    (globalThis as unknown as { window: unknown }).window = original;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('writeLocal', () => {
  test('writes valid value to localStorage', () => {
    writeLocal(KEY, VALID, TestSchema);
    expect(JSON.parse(localStorageMock.getItem(KEY)!)).toEqual(VALID);
  });

  test('throws TypeError for invalid value (developer bug surface)', () => {
    expect(() =>
      writeLocal(KEY, { name: 'Bob' } as unknown as TestShape, TestSchema),
    ).toThrow(TypeError);
  });

  test('logs warning and does NOT throw on QuotaExceededError', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = localStorageMock.setItem;
    localStorageMock.setItem = () => {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    };

    expect(() => writeLocal(KEY, VALID, TestSchema)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('QuotaExceededError'));

    localStorageMock.setItem = original;
    warnSpy.mockRestore();
  });

  test('is a no-op when localStorage is unavailable (SSR)', () => {
    const original = (globalThis as unknown as { window: unknown }).window;
    (globalThis as unknown as { window: unknown }).window = undefined;
    expect(() => writeLocal(KEY, VALID, TestSchema)).not.toThrow();
    (globalThis as unknown as { window: unknown }).window = original;
  });
});
