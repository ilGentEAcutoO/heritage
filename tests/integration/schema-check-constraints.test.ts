/**
 * Schema CHECK constraint tests (TASK-S3).
 *
 * Verifies that SQLite CHECK constraints on enum columns reject invalid values
 * at the DB boundary, so direct `wrangler d1 execute` writes with bad enums
 * are caught even when bypassing the ORM type system.
 *
 * Uses raw d1.prepare(sql).bind(...).run() to bypass drizzle's TS type checks.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';

// ---------------------------------------------------------------------------
// Shared minimal parent IDs
// ---------------------------------------------------------------------------

const USER_ID = 's3-user-001';
const USER2_ID = 's3-user-002';
const TREE_ID = 's3-tree-001';
const PERSON_ID = 's3-person-001';
const PERSON2_ID = 's3-person-002';

// ---------------------------------------------------------------------------
// Seed helper — inserts minimal FK prerequisites for all tests
// ---------------------------------------------------------------------------

async function seedMinimalParents(d1: SqliteD1Database): Promise<void> {
  // users
  await d1
    .prepare('INSERT INTO users (id, email) VALUES (?, ?)')
    .bind(USER_ID, 's3-owner@test.com')
    .run();
  await d1
    .prepare('INSERT INTO users (id, email) VALUES (?, ?)')
    .bind(USER2_ID, 's3-user2@test.com')
    .run();
  // tree (valid visibility so FK targets work)
  await d1
    .prepare("INSERT INTO trees (id, slug, name, owner_id, visibility) VALUES (?, ?, ?, ?, 'public')")
    .bind(TREE_ID, 's3-tree', 'S3 Tree', USER_ID)
    .run();
  // two people for relations tests
  await d1
    .prepare("INSERT INTO people (id, tree_id, name, is_me, external) VALUES (?, ?, ?, 0, 0)")
    .bind(PERSON_ID, TREE_ID, 'S3 Person')
    .run();
  await d1
    .prepare("INSERT INTO people (id, tree_id, name, is_me, external) VALUES (?, ?, ?, 0, 0)")
    .bind(PERSON2_ID, TREE_ID, 'S3 Person 2')
    .run();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Schema CHECK constraints (TASK-S3)', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    await seedMinimalParents(d1);
  });

  // -------------------------------------------------------------------------
  // S3-T1: trees.visibility
  // -------------------------------------------------------------------------
  test('S3-T1: trees.visibility rejects invalid enum value', async () => {
    await expect(
      d1
        .prepare("INSERT INTO trees (id, slug, name, visibility) VALUES (?, ?, ?, ?)")
        .bind('t-bad-1', 'slug-bad-1', 'Bad Tree', 'admin')
        .run()
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // S3-T2: tree_members.role
  // -------------------------------------------------------------------------
  test('S3-T2: tree_members.role rejects invalid enum value', async () => {
    await expect(
      d1
        .prepare("INSERT INTO tree_members (id, tree_id, user_id, role) VALUES (?, ?, ?, ?)")
        .bind('tm-bad-1', TREE_ID, USER_ID, 'superuser')
        .run()
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // S3-T3: tree_shares.status
  // -------------------------------------------------------------------------
  test('S3-T3: tree_shares.status rejects invalid enum value', async () => {
    await expect(
      d1
        .prepare(
          "INSERT INTO tree_shares (id, tree_id, email, role, status, invited_by) VALUES (?, ?, ?, 'viewer', ?, ?)"
        )
        .bind('ts-bad-status', TREE_ID, 'bad@test.com', 'nuked', USER_ID)
        .run()
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // S3-T4: tree_shares.role
  // -------------------------------------------------------------------------
  test('S3-T4: tree_shares.role rejects invalid enum value', async () => {
    await expect(
      d1
        .prepare(
          "INSERT INTO tree_shares (id, tree_id, email, role, status, invited_by) VALUES (?, ?, ?, ?, 'pending', ?)"
        )
        .bind('ts-bad-role', TREE_ID, 'badrole@test.com', 'admin', USER_ID)
        .run()
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // S3-T5: relations.kind
  // -------------------------------------------------------------------------
  test('S3-T5: relations.kind rejects invalid enum value', async () => {
    await expect(
      d1
        .prepare("INSERT INTO relations (tree_id, from_id, to_id, kind) VALUES (?, ?, ?, ?)")
        .bind(TREE_ID, PERSON_ID, PERSON2_ID, 'friend')
        .run()
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // S3-T6: people.gender (nullable — NULL and valid values must succeed)
  // -------------------------------------------------------------------------
  test('S3-T6: people.gender rejects invalid enum value, allows NULL and valid values', async () => {
    // Invalid gender should throw
    await expect(
      d1
        .prepare("INSERT INTO people (id, tree_id, name, gender, is_me, external) VALUES (?, ?, ?, ?, 0, 0)")
        .bind('p-bad-gender', TREE_ID, 'Bad Gender Person', 'x')
        .run()
    ).rejects.toThrow();

    // NULL gender must succeed
    await expect(
      d1
        .prepare("INSERT INTO people (id, tree_id, name, gender, is_me, external) VALUES (?, ?, ?, ?, 0, 0)")
        .bind('p-null-gender', TREE_ID, 'Null Gender Person', null)
        .run()
    ).resolves.not.toThrow();

    // gender='m' must succeed
    await expect(
      d1
        .prepare("INSERT INTO people (id, tree_id, name, gender, is_me, external) VALUES (?, ?, ?, ?, 0, 0)")
        .bind('p-m-gender', TREE_ID, 'Male Person', 'm')
        .run()
    ).resolves.not.toThrow();

    // gender='f' must succeed
    await expect(
      d1
        .prepare("INSERT INTO people (id, tree_id, name, gender, is_me, external) VALUES (?, ?, ?, ?, 0, 0)")
        .bind('p-f-gender', TREE_ID, 'Female Person', 'f')
        .run()
    ).resolves.not.toThrow();
  });

  // -------------------------------------------------------------------------
  // S3-T7: auth_tokens.kind
  // -------------------------------------------------------------------------
  test('S3-T7: auth_tokens.kind rejects invalid enum value', async () => {
    await expect(
      d1
        .prepare("INSERT INTO auth_tokens (token_hash, email, kind) VALUES (?, ?, ?)")
        .bind('hash-bad-kind', 'bad@test.com', 'admin')
        .run()
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // S3-T8: regression — every valid enum value inserts successfully
  // -------------------------------------------------------------------------
  test('S3-T8: all valid enum values insert successfully', async () => {
    // trees.visibility: 'public', 'private', 'shared'
    await expect(
      d1
        .prepare("INSERT INTO trees (id, slug, name, owner_id, visibility) VALUES (?, ?, ?, ?, ?)")
        .bind('t-vis-public', 'slug-vis-public', 'Public Tree', USER_ID, 'public')
        .run()
    ).resolves.not.toThrow();

    await expect(
      d1
        .prepare("INSERT INTO trees (id, slug, name, owner_id, visibility) VALUES (?, ?, ?, ?, ?)")
        .bind('t-vis-private', 'slug-vis-private', 'Private Tree', USER_ID, 'private')
        .run()
    ).resolves.not.toThrow();

    await expect(
      d1
        .prepare("INSERT INTO trees (id, slug, name, owner_id, visibility) VALUES (?, ?, ?, ?, ?)")
        .bind('t-vis-shared', 'slug-vis-shared', 'Shared Tree', USER_ID, 'shared')
        .run()
    ).resolves.not.toThrow();

    // tree_members.role: 'owner', 'editor', 'viewer'
    await expect(
      d1
        .prepare("INSERT INTO tree_members (id, tree_id, user_id, role) VALUES (?, ?, ?, ?)")
        .bind('tm-owner', TREE_ID, USER_ID, 'owner')
        .run()
    ).resolves.not.toThrow();

    await expect(
      d1
        .prepare("INSERT INTO tree_members (id, tree_id, user_id, role) VALUES (?, ?, ?, ?)")
        .bind('tm-editor', TREE_ID, USER2_ID, 'editor')
        .run()
    ).resolves.not.toThrow();

    await expect(
      d1
        .prepare("INSERT INTO tree_members (id, tree_id, user_id, role) VALUES (?, ?, ?, ?)")
        .bind('tm-viewer', 't-vis-public', USER_ID, 'viewer')
        .run()
    ).resolves.not.toThrow();

    // tree_shares.role: 'viewer', 'editor'; tree_shares.status: 'pending', 'accepted', 'revoked'
    await expect(
      d1
        .prepare(
          "INSERT INTO tree_shares (id, tree_id, email, role, status, invited_by) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind('tsh-1', TREE_ID, 'sh1@test.com', 'viewer', 'pending', USER_ID)
        .run()
    ).resolves.not.toThrow();

    await expect(
      d1
        .prepare(
          "INSERT INTO tree_shares (id, tree_id, email, role, status, invited_by) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind('tsh-2', TREE_ID, 'sh2@test.com', 'editor', 'accepted', USER_ID)
        .run()
    ).resolves.not.toThrow();

    await expect(
      d1
        .prepare(
          "INSERT INTO tree_shares (id, tree_id, email, role, status, invited_by) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind('tsh-3', TREE_ID, 'sh3@test.com', 'viewer', 'revoked', USER_ID)
        .run()
    ).resolves.not.toThrow();

    // relations.kind: 'parent', 'spouse'
    await expect(
      d1
        .prepare("INSERT INTO relations (tree_id, from_id, to_id, kind) VALUES (?, ?, ?, ?)")
        .bind(TREE_ID, PERSON_ID, PERSON2_ID, 'parent')
        .run()
    ).resolves.not.toThrow();

    await expect(
      d1
        .prepare("INSERT INTO relations (tree_id, from_id, to_id, kind) VALUES (?, ?, ?, ?)")
        .bind(TREE_ID, PERSON2_ID, PERSON_ID, 'spouse')
        .run()
    ).resolves.not.toThrow();

    // auth_tokens.kind: 'verify', 'reset'
    await expect(
      d1
        .prepare("INSERT INTO auth_tokens (token_hash, email, kind) VALUES (?, ?, ?)")
        .bind('hash-verify', 'v@test.com', 'verify')
        .run()
    ).resolves.not.toThrow();

    await expect(
      d1
        .prepare("INSERT INTO auth_tokens (token_hash, email, kind) VALUES (?, ?, ?)")
        .bind('hash-reset', 'r@test.com', 'reset')
        .run()
    ).resolves.not.toThrow();
  });
});
