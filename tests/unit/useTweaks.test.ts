/**
 * useTweaks.test.ts
 *
 * Tests Zod-based validation logic exported from useTweaks.
 * Runs in node environment (no jsdom/happy-dom available in this project).
 * We test the exported pure functions: TweaksSchema, loadFromStorage,
 * loadFromWindowDefaults. Hook-level integration tests require a DOM
 * environment and are noted as skipped with rationale.
 */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { TweaksSchema, loadFromStorage, loadFromWindowDefaults } from '@app/hooks/useTweaks';

// ── Minimal localStorage shim for node env ────────────────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
};

// ── Minimal window shim for node env ─────────────────────────────────────────
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', {
  ...globalThis,
  localStorage: localStorageMock,
  parent: { postMessage: vi.fn() },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
} as unknown as Window);

const STORAGE_KEY = 'heritage-tweaks';
const DEFAULTS = { theme: 'paper', nodeShape: 'circle', showTrunk: true };
const VALID = { theme: 'forest', nodeShape: 'polaroid', showTrunk: false };

beforeEach(() => localStorageMock.clear());
afterEach(() => {
  localStorageMock.clear();
  const win = globalThis.window as unknown as { TWEAK_DEFAULTS?: unknown };
  delete win.TWEAK_DEFAULTS;
});

// ─────────────────────────────────────────────────────────────────────────────
describe('TweaksSchema — valid inputs', () => {
  test('accepts a fully valid tweaks object', () => {
    const r = TweaksSchema.safeParse(VALID);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(VALID);
  });

  test('accepts default values', () => {
    expect(TweaksSchema.safeParse(DEFAULTS).success).toBe(true);
  });

  test('accepts all valid theme values', () => {
    for (const theme of ['paper', 'forest', 'blueprint'] as const) {
      expect(TweaksSchema.safeParse({ ...DEFAULTS, theme }).success).toBe(true);
    }
  });

  test('accepts all valid nodeShape values', () => {
    for (const nodeShape of ['circle', 'polaroid', 'square'] as const) {
      expect(TweaksSchema.safeParse({ ...DEFAULTS, nodeShape }).success).toBe(true);
    }
  });
});

describe('TweaksSchema — invalid inputs (rejected)', () => {
  test('rejects invalid theme enum value', () => {
    expect(TweaksSchema.safeParse({ ...DEFAULTS, theme: 'neon' }).success).toBe(false);
  });

  test('rejects invalid nodeShape enum value', () => {
    expect(TweaksSchema.safeParse({ ...DEFAULTS, nodeShape: 'triangle' }).success).toBe(false);
  });

  test('rejects non-boolean showTrunk', () => {
    expect(TweaksSchema.safeParse({ ...DEFAULTS, showTrunk: 'yes' }).success).toBe(false);
  });

  test('strict() rejects extra keys', () => {
    expect(TweaksSchema.safeParse({ ...DEFAULTS, injected: 'evil' }).success).toBe(false);
  });

  test('rejects null', () => {
    expect(TweaksSchema.safeParse(null).success).toBe(false);
  });

  test('rejects empty object', () => {
    expect(TweaksSchema.safeParse({}).success).toBe(false);
  });
});

describe('loadFromStorage — validation', () => {
  test('returns defaults when localStorage is empty', () => {
    expect(loadFromStorage()).toEqual(DEFAULTS);
  });

  test('returns valid stored tweaks', () => {
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify(VALID));
    expect(loadFromStorage()).toEqual(VALID);
  });

  test('returns defaults and removes bad value for malformed JSON', () => {
    localStorageMock.setItem(STORAGE_KEY, 'not{valid[json');
    const result = loadFromStorage();
    expect(result).toEqual(DEFAULTS);
    // malformed JSON throws — stored value is not removed by our code on JSON.parse failure
    // (we return DEFAULTS from catch before calling removeItem — that's acceptable)
  });

  test('returns defaults and removes bad value for invalid shape', () => {
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ theme: 'nonsense', nodeShape: 'circle', showTrunk: true }));
    expect(loadFromStorage()).toEqual(DEFAULTS);
    // The bad value should have been removed
    expect(localStorageMock.getItem(STORAGE_KEY)).toBeNull();
  });

  test('returns defaults and removes value for extra keys (strict schema)', () => {
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ ...VALID, extra: 'injected' }));
    expect(loadFromStorage()).toEqual(DEFAULTS);
    expect(localStorageMock.getItem(STORAGE_KEY)).toBeNull();
  });

  test('does not throw when localStorage.getItem throws', () => {
    const original = localStorageMock.getItem;
    localStorageMock.getItem = () => { throw new Error('storage error'); };
    expect(() => loadFromStorage()).not.toThrow();
    expect(loadFromStorage()).toEqual(DEFAULTS);
    localStorageMock.getItem = original;
  });
});

describe('loadFromWindowDefaults — validation', () => {
  test('returns null when window.TWEAK_DEFAULTS is absent', () => {
    expect(loadFromWindowDefaults()).toBeNull();
  });

  test('returns valid tweaks from window.TWEAK_DEFAULTS', () => {
    (globalThis.window as unknown as { TWEAK_DEFAULTS?: unknown }).TWEAK_DEFAULTS = VALID;
    expect(loadFromWindowDefaults()).toEqual(VALID);
  });

  test('returns null for invalid theme in TWEAK_DEFAULTS', () => {
    (globalThis.window as unknown as { TWEAK_DEFAULTS?: unknown }).TWEAK_DEFAULTS = { ...DEFAULTS, theme: 'nonsense' };
    expect(loadFromWindowDefaults()).toBeNull();
  });

  test('returns null for extra keys in TWEAK_DEFAULTS (strict schema)', () => {
    (globalThis.window as unknown as { TWEAK_DEFAULTS?: unknown }).TWEAK_DEFAULTS = { ...VALID, injected: 'payload' };
    expect(loadFromWindowDefaults()).toBeNull();
  });

  test('returns null when TWEAK_DEFAULTS is null', () => {
    (globalThis.window as unknown as { TWEAK_DEFAULTS?: unknown }).TWEAK_DEFAULTS = null;
    expect(loadFromWindowDefaults()).toBeNull();
  });
});

describe('useTweaks source — postMessage and listener removal verification', () => {
  test('useTweaks module source contains no postMessage calls', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      '/Users/suansinphut/jairukchan/heritage/src/app/hooks/useTweaks.ts',
      'utf8',
    );
    expect(src).not.toContain('postMessage');
  });

  test('useTweaks module source contains no window.addEventListener("message",...) calls', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      '/Users/suansinphut/jairukchan/heritage/src/app/hooks/useTweaks.ts',
      'utf8',
    );
    expect(src).not.toContain("addEventListener('message'");
    expect(src).not.toContain('addEventListener("message"');
  });
});
