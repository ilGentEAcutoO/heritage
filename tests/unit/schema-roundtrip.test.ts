import { describe, it, expect } from 'vitest';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../src/db/schema';
import { eq } from 'drizzle-orm';

describe('schema round-trip after 0002 migration', () => {
  it('users table has new auth columns', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as any, { schema });
    await db.insert(schema.users).values({
      id: 'u1',
      email: 'a@b.com',
      password_hash: 'deadbeef',
      password_salt: 'cafe',
      failed_login_count: 0,
      email_verified_at: null,
    });
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, 'u1') });
    expect(u?.password_hash).toBe('deadbeef');
    expect(u?.failed_login_count).toBe(0);
    expect(u?.email_verified_at).toBeNull();
  });

  it('tree_shares unique constraint is case-insensitive on email', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as any, { schema });
    // Seed owner user + tree
    await db.insert(schema.users).values({ id: 'owner', email: 'o@x.com' });
    await db.insert(schema.trees).values({
      id: 't1', slug: 't1', name: 'T1', owner_id: 'owner', visibility: 'shared',
    });
    // Insert first share
    await db.insert(schema.tree_shares).values({
      id: 's1', tree_id: 't1', email: 'bob@example.com',
      role: 'viewer', status: 'pending', invited_by: 'owner',
    });
    // Duplicate with different case must fail
    await expect(
      db.insert(schema.tree_shares).values({
        id: 's2', tree_id: 't1', email: 'BOB@Example.com',
        role: 'viewer', status: 'pending', invited_by: 'owner',
      })
    ).rejects.toThrow();
  });

  it('tree visibility enum accepts all three values and defaults to public', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as any, { schema });
    await db.insert(schema.users).values({ id: 'own', email: 'own@x.com' });
    // Insert a tree with each visibility value — no constraint error expected
    await db.insert(schema.trees).values({ id: 'tv1', slug: 'tv1', name: 'Pub',     owner_id: 'own', visibility: 'public'  });
    await db.insert(schema.trees).values({ id: 'tv2', slug: 'tv2', name: 'Priv',    owner_id: 'own', visibility: 'private' });
    await db.insert(schema.trees).values({ id: 'tv3', slug: 'tv3', name: 'Shared',  owner_id: 'own', visibility: 'shared'  });
    // Default visibility should be 'public'
    await db.insert(schema.trees).values({ id: 'tv4', slug: 'tv4', name: 'Default', owner_id: 'own' });
    const t = await db.query.trees.findFirst({ where: eq(schema.trees.id, 'tv4') });
    expect(t?.visibility).toBe('public');
  });

  it('auth_tokens.kind defaults to verify and accepts reset', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as any, { schema });
    // Insert with no kind → should default to 'verify'
    await db.insert(schema.auth_tokens).values({
      token_hash: 'hash1',
      email: 'x@y.com',
    });
    const t1 = await db.query.auth_tokens.findFirst({
      where: eq(schema.auth_tokens.token_hash, 'hash1'),
    });
    expect(t1?.kind).toBe('verify');

    // Insert with kind='reset' → round-trips
    await db.insert(schema.auth_tokens).values({
      token_hash: 'hash2',
      email: 'x@y.com',
      kind: 'reset',
    });
    const t2 = await db.query.auth_tokens.findFirst({
      where: eq(schema.auth_tokens.token_hash, 'hash2'),
    });
    expect(t2?.kind).toBe('reset');
  });

  it('lineage_members queries use idx_lineage_members_lineage_id', async () => {
    const d1 = createSqliteD1();
    // Not testing execution plan; instead assert the index row appears in sqlite_master
    const rows = await d1.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_lineage_members_lineage_id'"
    ).all();
    expect(rows.results.length).toBe(1);
  });

  // S2-T1 — trees table must NOT contain is_public column after migration
  it('S2-T1: trees table does NOT have is_public column', async () => {
    const d1 = createSqliteD1();
    const rows = await d1.prepare("PRAGMA table_info(trees)").all();
    const columnNames = (rows.results as Array<{ name: string }>).map((r) => r.name);
    expect(columnNames).not.toContain('is_public');
    // Confirm other key columns are still present
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('slug');
    expect(columnNames).toContain('visibility');
  });
});
