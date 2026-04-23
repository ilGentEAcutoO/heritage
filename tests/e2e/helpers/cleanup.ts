/**
 * cleanup.ts — purge E2E-scoped rows from prod D1.
 *
 * Touches only rows whose email or tree slug matches the e2e-%@example.com /
 * e2e-%-slug patterns. Never deletes seeded production data (wongsuriya tree).
 *
 * Called by global teardown + the `pnpm e2e:cleanup` CLI entry point.
 */

import { execSql } from './d1';

export function purgeE2EUsers(): void {
  // Order matters — FK references require dropping shares/sessions before users.
  // tree_shares.email may match pattern directly; also clear shares that reference
  // a user we're about to delete.
  execSql(
    `DELETE FROM tree_shares WHERE email LIKE 'e2e-%@example.com' OR user_id IN (SELECT id FROM users WHERE email LIKE 'e2e-%@example.com')`,
  );
  execSql(
    `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'e2e-%@example.com')`,
  );
  execSql(
    `DELETE FROM auth_tokens WHERE email LIKE 'e2e-%@example.com'`,
  );
  execSql(
    `DELETE FROM users WHERE email LIKE 'e2e-%@example.com'`,
  );
}

export function purgeE2ETrees(): void {
  // Trees created by E2E specs use slug prefix `e2e-`. We only ever create
  // the `trees` row (POST /api/trees) and subsequent tree_shares rows — no
  // people / stories / memos / lineages are populated by the specs.
  //
  // Cascade DELETEs on people / relations / stories / memos are sufficient
  // via the schema FKs (onDelete: 'cascade') — still we run them explicitly
  // to be robust if a future spec populates them.
  const ids = execSql(
    `SELECT id FROM trees WHERE slug LIKE 'e2e-%'`,
  ) as Array<{ id: string }>;

  if (ids.length === 0) return;

  const idList = ids
    .map((r) => `'${r.id.replace(/'/g, "''")}'`)
    .join(',');

  execSql(`DELETE FROM tree_shares WHERE tree_id IN (${idList})`);
  execSql(`DELETE FROM tree_members WHERE tree_id IN (${idList})`);
  execSql(`DELETE FROM relations WHERE tree_id IN (${idList})`);
  execSql(`DELETE FROM memos WHERE person_id IN (SELECT id FROM people WHERE tree_id IN (${idList}))`);
  execSql(`DELETE FROM stories WHERE person_id IN (SELECT id FROM people WHERE tree_id IN (${idList}))`);
  execSql(`DELETE FROM photos WHERE person_id IN (SELECT id FROM people WHERE tree_id IN (${idList}))`);
  execSql(`DELETE FROM people WHERE tree_id IN (${idList})`);
  execSql(`DELETE FROM trees WHERE id IN (${idList})`);
}
