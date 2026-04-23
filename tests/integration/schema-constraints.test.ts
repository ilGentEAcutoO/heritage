/**
 * Schema constraint tests for the photos table (M9).
 *
 * Verifies that object_key, mime, and bytes are NOT NULL at the DB level,
 * catching any attempt to insert a row that omits these required fields.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { createDb } from '@db/client';
import { users, trees, people, photos } from '@db/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER_ID = 'sc-owner-001';
const TREE_ID = 'sc-tree-001';
const PERSON_ID = 'sc-person-001';

async function seedMinimal(d1: SqliteD1Database): Promise<void> {
  const db = createDb(d1 as unknown as D1Database);
  await db.insert(users).values({ id: OWNER_ID, email: 'sc-owner@test.com', display_name: 'SC Owner' });
  await db.insert(trees).values({
    id: TREE_ID,
    slug: 'sc-tree',
    name: 'SC Tree',
    owner_id: OWNER_ID,
  });
  await db.insert(people).values({
    id: PERSON_ID,
    tree_id: TREE_ID,
    name: 'SC Person',
    is_me: false,
    external: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('photos table NOT NULL constraints (M9)', () => {
  let d1: SqliteD1Database;
  let sqlite: Database.Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    sqlite = d1._sqlite;
    await seedMinimal(d1);
  });

  test('inserting a row with all required fields succeeds', async () => {
    const db = createDb(d1 as unknown as D1Database);
    await expect(
      db.insert(photos).values({
        id: 'photo-valid-001',
        person_id: PERSON_ID,
        object_key: 'photos/sc-tree-001/sc-person-001/01J0000000000000000000000A.jpg',
        mime: 'image/jpeg',
        bytes: 4096,
      }),
    ).resolves.not.toThrow();
  });

  test('inserting a row with mime = NULL throws a NOT NULL constraint error', () => {
    expect(() =>
      sqlite.prepare(
        `INSERT INTO photos (id, person_id, object_key, mime, bytes) VALUES (?, ?, ?, ?, ?)`,
      ).run('photo-null-mime', PERSON_ID, 'photos/key.jpg', null, 4096),
    ).toThrow(/NOT NULL constraint failed: photos.mime/i);
  });

  test('inserting a row with object_key = NULL throws a NOT NULL constraint error', () => {
    expect(() =>
      sqlite.prepare(
        `INSERT INTO photos (id, person_id, object_key, mime, bytes) VALUES (?, ?, ?, ?, ?)`,
      ).run('photo-null-key', PERSON_ID, null, 'image/jpeg', 4096),
    ).toThrow(/NOT NULL constraint failed: photos.object_key/i);
  });

  test('inserting a row with bytes = NULL throws a NOT NULL constraint error', () => {
    expect(() =>
      sqlite.prepare(
        `INSERT INTO photos (id, person_id, object_key, mime, bytes) VALUES (?, ?, ?, ?, ?)`,
      ).run('photo-null-bytes', PERSON_ID, 'photos/key.jpg', 'image/jpeg', null),
    ).toThrow(/NOT NULL constraint failed: photos.bytes/i);
  });
});
