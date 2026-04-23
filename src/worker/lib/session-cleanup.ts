/**
 * session-cleanup.ts — helper for purging expired session metadata.
 *
 * N-R3-8 (Informational): the `sessions` table records the user's IP and
 * User-Agent alongside each token. These are modest PII that should not
 * linger past the session's `expires_at`. This module provides a single
 * `deleteExpiredSessions` helper that a future cron / ops task can call
 * (e.g. Cloudflare cron trigger hitting an admin endpoint, or a scheduled
 * migration). No cron is wired today — this helper exists so the cleanup
 * policy lives in code, not in a runbook.
 *
 * Recommended cadence: once per hour. Cost: a single DELETE, fully indexable
 * on `expires_at` (see `sessions_expires_idx` in schema.ts).
 */

import { lt } from 'drizzle-orm';
import type { DB } from '../../db/client';
import { sessions } from '../../db/schema';

/**
 * Delete all session rows whose `expires_at` has passed.
 *
 * @param db — the drizzle D1 handle from `c.var.db`.
 * @returns the number of rows deleted (best-effort — the D1 driver returns
 * a `changes` number that we surface as-is).
 */
export async function deleteExpiredSessions(db: DB): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expires_at, now))
    .returning({ id: sessions.id })
    .all();
  return result.length;
}
