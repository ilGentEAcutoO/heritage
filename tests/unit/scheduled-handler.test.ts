/**
 * Unit tests for the `scheduled` export on the default worker module.
 *
 * N-R3-8 / TASK-S4: Verifies the Cloudflare cron trigger handler wires
 * `deleteExpiredSessions` correctly and fails closed on errors.
 *
 * Does NOT re-test `deleteExpiredSessions` internals — those are covered by
 * tests/unit/session-cleanup.test.ts.
 */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/d1';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import * as schema from '../../src/db/schema';
import { hashToken } from '../../src/worker/lib/tokens';
import workerModule from '../../src/worker/index';
import type { Env } from '../../src/worker/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnv(d1?: unknown): Record<string, unknown> {
  return {
    DB: d1 ?? null,
    ASSETS: {},
    PHOTOS: {},
    KV_RL: {},
    EMAIL: {},
    RL_LOGIN: {},
    RL_LOGIN_IP: {},
    APP_URL: 'https://heritage.jairukchan.com',
    SESSION_SECRET: 'test-secret-at-least-32-chars-long!!',
  };
}

const fakeEvent = { scheduledTime: Date.now(), cron: '0 * * * *', noRetry: () => undefined } as unknown as ScheduledController;
const fakeCtx = { waitUntil: (_p: Promise<unknown>) => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;

// ---------------------------------------------------------------------------
// Suite 1 — happy path
// ---------------------------------------------------------------------------

describe('scheduled() — hourly session cleanup', () => {
  let d1: ReturnType<typeof createSqliteD1>;
  let db: ReturnType<typeof drizzle>;

  beforeEach(async () => {
    d1 = createSqliteD1();
    db = drizzle(d1 as unknown as D1Database, { schema });

    const now = Math.floor(Date.now() / 1000);

    await db.insert(schema.users).values({ id: 'u1', email: 'u1@example.com' });

    // Expired session — should be purged
    await db.insert(schema.sessions).values({
      id: 's-expired',
      token_hash: hashToken('expired-token'),
      user_id: 'u1',
      expires_at: now - 3600,
    });

    // Fresh session — must survive
    await db.insert(schema.sessions).values({
      id: 's-fresh',
      token_hash: hashToken('fresh-token'),
      user_id: 'u1',
      expires_at: now + 3600,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('removes expired sessions and retains fresh ones', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const env = makeEnv(d1);

    await workerModule.scheduled(fakeEvent, env as unknown as Env, fakeCtx);

    // Expired row gone, fresh row intact
    const remaining = await db.select().from(schema.sessions).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('s-fresh');

    // Structured log emitted
    expect(logSpy).toHaveBeenCalledOnce();
    const logArg = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(logArg).toMatchObject({ event: 'sessions_purged', count: 1 });

    // No error logged on the happy path
    expect(errSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — fails closed
// ---------------------------------------------------------------------------

describe('scheduled() — fails closed on error', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('resolves without throwing when env is misconfigured', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    // Pass a null DB to trigger an error inside the handler
    const brokenEnv = makeEnv(null);

    await expect(
      workerModule.scheduled(fakeEvent, brokenEnv as unknown as Env, fakeCtx),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalled();
    const [prefix] = errSpy.mock.calls[0] as [string, ...unknown[]];
    expect(prefix).toContain('[scheduled]');
  });
});
