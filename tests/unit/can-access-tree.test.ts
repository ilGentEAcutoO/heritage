/**
 * Unit tests for canAccessTree — 12-cell visibility matrix.
 *
 * Stubs the DB with a lightweight object that mimics the drizzle query interface.
 * No real SQLite is needed here; we control the share-lookup return value.
 */

import { describe, test, expect, vi, type MockedFunction } from 'vitest';
import { canAccessTree, type TreeForGate } from '@worker/lib/can-access-tree';

// ---------------------------------------------------------------------------
// DB stub helpers
// ---------------------------------------------------------------------------

type FakeDb = Parameters<typeof canAccessTree>[0];

/**
 * Build a minimal DB stub where the tree_shares SELECT returns the given rows.
 * The stub models the drizzle `.select().from().where().limit().all()` chain.
 */
function makeDb(shareRows: Array<{ id: string }>): FakeDb {
  const allFn = vi.fn(async () => shareRows);
  const limitFn = vi.fn(() => ({ all: allFn }));
  const whereFn = vi.fn(() => ({ limit: limitFn }));
  const fromFn  = vi.fn(() => ({ where: whereFn }));
  const selectFn = vi.fn(() => ({ from: fromFn }));

  return { select: selectFn } as unknown as FakeDb;
}

// ---------------------------------------------------------------------------
// Fixture trees
// ---------------------------------------------------------------------------

const PUBLIC_TREE: TreeForGate = {
  id: 'tree-pub',
  visibility: 'public',
  owner_id: 'owner-1',
};

const PRIVATE_TREE: TreeForGate = {
  id: 'tree-priv',
  visibility: 'private',
  owner_id: 'owner-1',
};

const SHARED_TREE: TreeForGate = {
  id: 'tree-shared',
  visibility: 'shared',
  owner_id: 'owner-1',
};

const PUBLIC_TREE_NULL_OWNER: TreeForGate = {
  id: 'tree-demo',
  visibility: 'public',
  owner_id: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OWNER_ID = 'owner-1';
const NON_OWNER_ID = 'non-owner-2';

// ---------------------------------------------------------------------------
// 1. visibility = 'public'
// ---------------------------------------------------------------------------

describe('canAccessTree — public trees', () => {
  test('public × anon → true', async () => {
    const db = makeDb([]); // no shares needed; never queried
    expect(await canAccessTree(db, PUBLIC_TREE, null)).toBe(true);
  });

  test('public × owner → true', async () => {
    const db = makeDb([]);
    expect(await canAccessTree(db, PUBLIC_TREE, OWNER_ID)).toBe(true);
  });

  test('public × non-owner → true', async () => {
    const db = makeDb([]);
    expect(await canAccessTree(db, PUBLIC_TREE, NON_OWNER_ID)).toBe(true);
  });

  test('public × owner_id IS NULL (demo tree) → true', async () => {
    const db = makeDb([]);
    expect(await canAccessTree(db, PUBLIC_TREE_NULL_OWNER, null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. visibility = 'private'
// ---------------------------------------------------------------------------

describe('canAccessTree — private trees', () => {
  test('private × anon → false', async () => {
    const db = makeDb([]);
    expect(await canAccessTree(db, PRIVATE_TREE, null)).toBe(false);
  });

  test('private × owner → true', async () => {
    const db = makeDb([]);
    expect(await canAccessTree(db, PRIVATE_TREE, OWNER_ID)).toBe(true);
  });

  test('private × non-owner → false', async () => {
    const db = makeDb([]);
    expect(await canAccessTree(db, PRIVATE_TREE, NON_OWNER_ID)).toBe(false);
  });

  test('private × owner_id IS NULL (degenerate) → false (fail-closed)', async () => {
    const tree: TreeForGate = { id: 'tree-x', visibility: 'private', owner_id: null };
    const db = makeDb([]);
    // Even if userId is supplied, owner_id=null can never match — fail closed.
    expect(await canAccessTree(db, tree, 'any-user')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. visibility = 'shared'
// ---------------------------------------------------------------------------

describe('canAccessTree — shared trees', () => {
  test('shared × anon → false', async () => {
    const db = makeDb([]); // no accepted share
    expect(await canAccessTree(db, SHARED_TREE, null)).toBe(false);
  });

  test('shared × owner → true (no DB share lookup needed)', async () => {
    const db = makeDb([]);
    expect(await canAccessTree(db, SHARED_TREE, OWNER_ID)).toBe(true);
  });

  test('shared × non-owner with accepted share → true', async () => {
    const db = makeDb([{ id: 'share-001' }]); // DB returns a matching row
    expect(await canAccessTree(db, SHARED_TREE, NON_OWNER_ID)).toBe(true);
  });

  test('shared × non-owner with pending share → false', async () => {
    // The WHERE clause filters status='accepted'; stub returns no rows.
    const db = makeDb([]);
    expect(await canAccessTree(db, SHARED_TREE, NON_OWNER_ID)).toBe(false);
  });

  test('shared × non-owner with no share at all → false', async () => {
    const db = makeDb([]);
    expect(await canAccessTree(db, SHARED_TREE, NON_OWNER_ID)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. DB error → fail-closed
// ---------------------------------------------------------------------------

describe('canAccessTree — DB error handling', () => {
  test('DB error during share lookup → false (fail-closed)', async () => {
    const allFn = vi.fn(async () => { throw new Error('D1 error'); });
    const limitFn = vi.fn(() => ({ all: allFn }));
    const whereFn = vi.fn(() => ({ limit: limitFn }));
    const fromFn  = vi.fn(() => ({ where: whereFn }));
    const selectFn = vi.fn(() => ({ from: fromFn }));
    const db = { select: selectFn } as unknown as FakeDb;

    expect(await canAccessTree(db, SHARED_TREE, NON_OWNER_ID)).toBe(false);
  });
});
