/**
 * S2-T3 — getTreeData() must not return an isPublic field on the tree object.
 *
 * After TASK-S2, TreeMeta.isPublic is removed. This test confirms the returned
 * tree object does not carry the deprecated key.
 */

import { describe, it, expect } from 'vitest';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../src/db/schema';
import { getTreeData } from '../../src/worker/lib/tree-query';

describe('S2-T3 — getTreeData does not return isPublic', () => {
  it('tree object returned by getTreeData has no isPublic key', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });

    // Seed minimal data
    await db.insert(schema.users).values({ id: 'u-s2t3', email: 's2t3@test.com' });
    await db.insert(schema.trees).values({
      id: 't-s2t3',
      slug: 's2t3-tree',
      name: 'S2-T3 Tree',
      owner_id: 'u-s2t3',
      visibility: 'public',
    });

    // Use the actual DB type (DB = DrizzleD1Database)
    // getTreeData accepts a DB from createDb; we cast via the same drizzle call
    const { createDb } = await import('../../src/db/client');
    const workerDb = createDb(d1 as unknown as D1Database);
    const result = await getTreeData(workerDb, 's2t3-tree');

    expect(result).not.toBeNull();
    expect(result!.tree).toBeDefined();
    // The key check: isPublic must not be present
    expect('isPublic' in result!.tree).toBe(false);
  });
});
