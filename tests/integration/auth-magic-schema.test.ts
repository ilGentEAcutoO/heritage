/**
 * M2 — auth_tokens.kind CHECK constraint tests for magic-link support.
 *
 * M2-T1: kind='magic' → success after migration 0005 (RED on current main).
 * M2-T2: kind='bogus' → throws (regression guard: CHECK still rejects unknowns).
 * M2-T3: kind='verify' and kind='reset' → success (migration is additive, not breaking).
 *
 * Uses raw d1.prepare(sql).bind(...).run() to bypass drizzle's TS type checks.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';

describe('auth_tokens.kind CHECK — magic extension (M2)', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
  });

  // -------------------------------------------------------------------------
  // M2-T1: kind='magic' must be accepted after migration 0005
  // -------------------------------------------------------------------------
  test('M2-T1: kind="magic" inserts successfully', async () => {
    await expect(
      d1
        .prepare("INSERT INTO auth_tokens (token_hash, email, kind) VALUES (?, ?, ?)")
        .bind('hash-magic-001', 'magic@test.com', 'magic')
        .run()
    ).resolves.not.toThrow();
  });

  // -------------------------------------------------------------------------
  // M2-T2: kind='bogus' must still be rejected (CHECK constraint regression)
  // -------------------------------------------------------------------------
  test('M2-T2: kind="bogus" is rejected by CHECK constraint', async () => {
    await expect(
      d1
        .prepare("INSERT INTO auth_tokens (token_hash, email, kind) VALUES (?, ?, ?)")
        .bind('hash-bogus-001', 'bogus@test.com', 'bogus')
        .run()
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // M2-T3: existing kind values 'verify' and 'reset' remain valid
  // -------------------------------------------------------------------------
  test('M2-T3: kind="verify" and kind="reset" still insert successfully', async () => {
    await expect(
      d1
        .prepare("INSERT INTO auth_tokens (token_hash, email, kind) VALUES (?, ?, ?)")
        .bind('hash-verify-m2', 'verify@test.com', 'verify')
        .run()
    ).resolves.not.toThrow();

    await expect(
      d1
        .prepare("INSERT INTO auth_tokens (token_hash, email, kind) VALUES (?, ?, ?)")
        .bind('hash-reset-m2', 'reset@test.com', 'reset')
        .run()
    ).resolves.not.toThrow();
  });
});
