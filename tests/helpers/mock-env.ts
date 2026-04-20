/**
 * Shared mock Env builder for worker integration tests.
 *
 * Wires together:
 *   - a real SQLite-backed D1 shim (from ./sqlite-d1.ts) so Drizzle actually executes SQL
 *   - R2 stub + KV stub (shared with upload tests)
 *   - an EMAIL spy that records send() calls instead of hitting the network
 *
 * Every call yields a fresh DB with schema migrated; tests remain hermetic.
 *
 * Exposes legacy shapes (R2BucketStub, KVNamespaceStub, buildMockEnv) used by
 * earlier agents' tests. Auth tests use `createMockEnv()` which returns
 * `{ env, sqlite, emailSpy }`.
 */
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
// Email spy
// ---------------------------------------------------------------------------

export interface EmailSendCall {
  from: string;
  to: string | string[];
  subject?: string;
  html?: string;
  text?: string;
}

export interface EmailSpy {
  readonly calls: EmailSendCall[];
  reset(): void;
  // The CF binding surface — lets us cast to SendEmail.
  send(msg: unknown): Promise<{ messageId: string }>;
}

function makeEmailSpy(): EmailSpy {
  const calls: EmailSendCall[] = [];
  return {
    async send(msg: unknown) {
      const m = msg as EmailSendCall;
      calls.push({
        from: m.from as string,
        to: m.to,
        subject: m.subject,
        html: m.html,
        text: m.text,
      });
      return { messageId: `mock-${calls.length}` };
    },
    get calls() {
      return calls;
    },
    reset() {
      calls.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Primary builder — used by auth integration tests
// ---------------------------------------------------------------------------

export interface MockEnvHandle {
  env: Env;
  d1: SqliteD1Database;
  emailSpy: EmailSpy;
  kv: KVNamespaceStub;
  r2: R2BucketStub;
}

export interface MockEnvOptions {
  appUrl?: string;
  emailFrom?: string;
  /** '1' logs magic links to console; '0' (default) invokes the EMAIL spy. */
  emailDevStub?: string;
  sessionSecret?: string;
}

export function createMockEnv(opts: MockEnvOptions = {}): MockEnvHandle {
  const d1 = createSqliteD1();
  const emailSpy = makeEmailSpy();
  const kv = new KVNamespaceStub();
  const r2 = new R2BucketStub();

  const env: Env = {
    DB: d1 as unknown as D1Database,
    KV_RL: kv as unknown as KVNamespace,
    EMAIL: emailSpy as unknown as SendEmail,
    PHOTOS: r2 as unknown as R2Bucket,
    ASSETS: {} as Fetcher,
    APP_URL: opts.appUrl ?? 'http://localhost:5173',
    EMAIL_FROM: opts.emailFrom ?? 'noreply@example.com',
    EMAIL_DEV_STUB: opts.emailDevStub ?? '0',
    SESSION_SECRET:
      opts.sessionSecret ?? 'test-session-secret-very-very-long-1234567890abcdef',
  };

  return { env, d1, emailSpy, kv, r2 };
}
