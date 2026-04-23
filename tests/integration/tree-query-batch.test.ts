/**
 * Perf Fix 3 — batch lineage_members query.
 *
 * Verifies that getTreeData() issues exactly ONE SELECT against the
 * lineage_members table regardless of how many lineages exist in the tree.
 *
 * Strategy: we intercept the D1 shim's `prepare()` method to count how many
 * distinct SQL statements touch `lineage_members`.  This is the lowest-level
 * hook in the sqlite-d1 wrapper — every SELECT (and INSERT/UPDATE/DELETE) goes
 * through `prepare()` so the counter is reliable.
 *
 * The demo seed has 4 lineages, each with 4-5 members.  With the N-query
 * implementation the counter would hit 4; with the single inArray query it
 * must be exactly 1.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@db/schema';
import { seedDemo } from '@worker/lib/seed';
import { getTreeData } from '@worker/lib/tree-query';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wraps SqliteD1Database.prepare() to count how many SQL statements
 * reference the lineage_members table (case-insensitive substring match).
 * Returns a cleanup function that removes the shim and exposes the count.
 */
function wrapPrepareCounter(d1: SqliteD1Database): { getCount: () => number } {
  let count = 0;
  const originalPrepare = d1.prepare.bind(d1);

  d1.prepare = (sql: string) => {
    if (sql.toLowerCase().includes('lineage_members')) {
      count++;
    }
    return originalPrepare(sql);
  };

  return { getCount: () => count };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('getTreeData — lineage_members batch query (Perf Fix 3)', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });
    await seedDemo(db);
  });

  test('issues exactly 1 SELECT against lineage_members for a tree with 4 lineages', async () => {
    // Attach counter AFTER seeding (so seed inserts aren't counted)
    const { getCount } = wrapPrepareCounter(d1);

    const db = drizzle(d1 as unknown as D1Database, { schema });
    const result = await getTreeData(db, 'wongsuriya');

    // Basic shape sanity
    expect(result).not.toBeNull();
    expect(Object.keys(result!.lineages)).toHaveLength(4);

    // === Core perf assertion ===
    // With the old N-query path this equals 4; must be exactly 1 after fix.
    expect(getCount()).toBe(1);
  });

  test('returned lineage members still grouped correctly under each lineage', async () => {
    const db = drizzle(d1 as unknown as D1Database, { schema });
    const result = await getTreeData(db, 'wongsuriya');

    expect(result).not.toBeNull();
    const lineages = result!.lineages;

    // Each bridge person's lineage must have its members array populated
    // The demo seed gives each lineage 4-5 members (see LINEAGES_DATA previews)
    for (const [, lineage] of Object.entries(lineages)) {
      expect(lineage.members.length).toBeGreaterThanOrEqual(2);
    }

    // Spot-check: Kaewsai lineage (bridge p8) has 5 preview members
    const kaewsai = lineages['p8'];
    expect(kaewsai).toBeDefined();
    expect(kaewsai.members).toHaveLength(5);

    // Spot-check: Pongpaisarn lineage (bridge p10) has 4 preview members
    const pongpaisarn = lineages['p10'];
    expect(pongpaisarn).toBeDefined();
    expect(pongpaisarn.members).toHaveLength(4);
  });
});
