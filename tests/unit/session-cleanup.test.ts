/**
 * Unit tests for `deleteExpiredSessions` (N-R3-8 helper).
 */

import { describe, test, expect } from 'vitest';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import * as schema from '../../src/db/schema';
import { deleteExpiredSessions } from '../../src/worker/lib/session-cleanup';
import { hashToken } from '../../src/worker/lib/tokens';

describe('deleteExpiredSessions', () => {
  test('deletes only expired rows; returns count', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });
    const now = Math.floor(Date.now() / 1000);

    await db.insert(schema.users).values({ id: 'u1', email: 'u1@example.com' });

    // Expired
    await db.insert(schema.sessions).values({
      id: 's-old-1',
      token_hash: hashToken('old-token-1'),
      user_id: 'u1',
      expires_at: now - 60,
    });
    await db.insert(schema.sessions).values({
      id: 's-old-2',
      token_hash: hashToken('old-token-2'),
      user_id: 'u1',
      expires_at: now - 3600,
    });
    // Not expired
    await db.insert(schema.sessions).values({
      id: 's-live',
      token_hash: hashToken('live-token'),
      user_id: 'u1',
      expires_at: now + 3600,
    });

    const deleted = await deleteExpiredSessions(db);
    expect(deleted).toBe(2);

    const remaining = await db.select().from(schema.sessions).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('s-live');
  });

  test('no rows to delete → returns 0', async () => {
    const d1 = createSqliteD1();
    const db = drizzle(d1 as unknown as D1Database, { schema });
    const now = Math.floor(Date.now() / 1000);

    await db.insert(schema.users).values({ id: 'u1', email: 'u1@example.com' });
    await db.insert(schema.sessions).values({
      id: 's-live',
      token_hash: hashToken('live-token'),
      user_id: 'u1',
      expires_at: now + 3600,
    });

    const deleted = await deleteExpiredSessions(db);
    expect(deleted).toBe(0);

    const remaining = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, 's-live'))
      .all();
    expect(remaining).toHaveLength(1);
  });
});
