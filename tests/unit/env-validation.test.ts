import { describe, it, expect, beforeEach } from 'vitest';
import { getValidatedEnv, _resetValidatedEnvCache } from '../../src/worker/lib/config';

describe('env validation', () => {
  beforeEach(() => {
    _resetValidatedEnvCache();
  });

  it('rejects when SESSION_SECRET is missing', () => {
    expect(() => getValidatedEnv({ APP_URL: 'https://x.com' } as any))
      .toThrow(/SESSION_SECRET/i);
  });

  it('rejects when SESSION_SECRET is shorter than 32 chars', () => {
    expect(() => getValidatedEnv({
      APP_URL: 'https://x.com',
      SESSION_SECRET: 'short',
    } as any)).toThrow(/SESSION_SECRET/i);
  });

  it('accepts when SESSION_SECRET is 32+ chars', () => {
    expect(() => getValidatedEnv({
      APP_URL: 'https://x.com',
      SESSION_SECRET: 'a'.repeat(40),
    } as any)).not.toThrow();
  });
});
