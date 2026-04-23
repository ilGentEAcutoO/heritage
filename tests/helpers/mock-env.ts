/**
 * Shared mock Env builder for worker integration tests.
 *
 * Wires together:
 *   - a real SQLite-backed D1 shim (from ./sqlite-d1.ts) so Drizzle actually executes SQL
 *   - R2 stub + KV stub
 *
 * Every call yields a fresh DB with schema migrated; tests remain hermetic.
 *
 * Exposes legacy shapes (R2BucketStub, KVNamespaceStub, buildMockEnv) used by
 * earlier agents' tests.
 */
import { vi } from 'vitest';
import { createSqliteD1, type SqliteD1Database } from './sqlite-d1';
import type { Env } from '../../src/worker/types';

// Re-export the stubs that other tests already depend on.
export {
  R2BucketStub,
  R2ObjectBodyStub,
  KVNamespaceStub,
  buildMockEnv,
  type R2ObjectStub,
  type PhotoRecord,
  type PersonRecord,
  type TreeRecord,
  type TreeMemberRecord,
  InMemoryStore,
} from './sqlite-d1-legacy';

import { R2BucketStub, KVNamespaceStub } from './sqlite-d1-legacy';

// ---------------------------------------------------------------------------
// Primary builder
// ---------------------------------------------------------------------------

export interface MockEnvHandle {
  env: Env;
  d1: SqliteD1Database;
  kv: KVNamespaceStub;
  r2: R2BucketStub;
}

export interface MockEnvOptions {
  appUrl?: string;
}

export function createMockEnv(opts: MockEnvOptions = {}): MockEnvHandle {
  const d1 = createSqliteD1();
  const kv = new KVNamespaceStub();
  const r2 = new R2BucketStub();

  const env: Env = {
    DB: d1 as unknown as D1Database,
    KV_RL: kv as unknown as KVNamespace,
    PHOTOS: r2 as unknown as R2Bucket,
    ASSETS: {} as Fetcher,
    APP_URL: opts.appUrl ?? 'http://localhost:5173',
    SESSION_SECRET: 'test-secret-at-least-thirty-two-characters-long-padding',
    EMAIL: { send: vi.fn(async () => undefined) } as unknown as SendEmail,
    RL_LOGIN: { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit,
    RL_LOGIN_IP: { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit,
  };

  return { env, d1, kv, r2 };
}
