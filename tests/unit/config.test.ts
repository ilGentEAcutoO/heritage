/**
 * Unit tests for src/worker/lib/config.ts (M2 remediation).
 *
 * Covers:
 *   - `assertEnv` accepts a valid https APP_URL
 *   - `assertEnv` accepts http://localhost for dev
 *   - `assertEnv` rejects http:// for non-loopback hosts
 *   - `assertEnv` rejects malformed URLs
 *   - `assertEnv` rejects missing APP_URL
 *   - `getValidatedEnv` caches per-env so we don't re-parse on every request
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  assertEnv,
  getValidatedEnv,
  _resetValidatedEnvCache,
} from '@worker/lib/config';
import type { Env } from '@worker/types';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    PHOTOS: {} as R2Bucket,
    KV_RL: {} as KVNamespace,
    ASSETS: {} as Fetcher,
    APP_URL: 'https://heritage.example.com',
    ...overrides,
  } as Env;
}

describe('assertEnv', () => {
  test('accepts a valid https APP_URL', () => {
    expect(() => assertEnv(makeEnv({ APP_URL: 'https://heritage.example.com' }))).not.toThrow();
  });

  test('accepts http://localhost for local development', () => {
    expect(() => assertEnv(makeEnv({ APP_URL: 'http://localhost:5173' }))).not.toThrow();
  });

  test('accepts http://127.0.0.1 for local development', () => {
    expect(() => assertEnv(makeEnv({ APP_URL: 'http://127.0.0.1:8787' }))).not.toThrow();
  });

  test('throws when APP_URL is http:// on a non-loopback host', () => {
    expect(() =>
      assertEnv(makeEnv({ APP_URL: 'http://heritage.example.com' })),
    ).toThrow(/https/);
  });

  test('throws when APP_URL is malformed', () => {
    expect(() => assertEnv(makeEnv({ APP_URL: 'not a url' }))).toThrow(/valid URL/);
  });

  test('throws when APP_URL uses a non-http(s) scheme', () => {
    expect(() => assertEnv(makeEnv({ APP_URL: 'ftp://example.com' }))).toThrow(
      /http or https/,
    );
  });

  test('throws when APP_URL is missing', () => {
    // TS-cast away the required field to simulate an unset binding.
    const env = makeEnv();
    (env as { APP_URL?: string }).APP_URL = undefined;
    expect(() => assertEnv(env)).toThrow(/not defined/);
  });

  test('throws when APP_URL is an empty string', () => {
    expect(() => assertEnv(makeEnv({ APP_URL: '' }))).toThrow(/not defined/);
  });
});

describe('getValidatedEnv', () => {
  beforeEach(() => {
    _resetValidatedEnvCache();
  });

  test('returns the env when valid', () => {
    const env = makeEnv({ APP_URL: 'https://heritage.example.com' });
    expect(getValidatedEnv(env)).toBe(env);
  });

  test('throws once, then caches — second call does not re-validate', () => {
    const env = makeEnv({ APP_URL: 'https://heritage.example.com' });
    getValidatedEnv(env);
    // Mutate APP_URL post-cache; cached Env should skip validation.
    (env as { APP_URL: string }).APP_URL = 'not a url';
    expect(() => getValidatedEnv(env)).not.toThrow();
  });

  test('distinct Env objects are validated independently', () => {
    const good = makeEnv({ APP_URL: 'https://heritage.example.com' });
    const bad = makeEnv({ APP_URL: 'http://heritage.example.com' });
    expect(() => getValidatedEnv(good)).not.toThrow();
    expect(() => getValidatedEnv(bad)).toThrow(/https/);
  });

  test('throws propagate from getValidatedEnv on first call', () => {
    const env = makeEnv({ APP_URL: 'not a url' });
    expect(() => getValidatedEnv(env)).toThrow(/valid URL/);
  });
});
