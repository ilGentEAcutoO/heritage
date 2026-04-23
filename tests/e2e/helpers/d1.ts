/**
 * d1.ts — shell-out helper for running SQL against the remote D1 database.
 *
 * All SQL is test-authored; never pass user-controlled strings.
 * Returns the first result set's `results` array, or [] if the query had no rows.
 */

import { execFileSync } from 'node:child_process';

interface D1ExecResult {
  results?: unknown[];
  success: boolean;
  meta?: unknown;
  error?: string;
}

export function execSql(sql: string): unknown[] {
  // Use pnpm wrangler because the project uses pnpm; --json yields machine-parseable output.
  const stdout = execFileSync(
    'pnpm',
    [
      'wrangler',
      'd1',
      'execute',
      'heritage-d1-main',
      '--remote',
      '--command',
      sql,
      '--json',
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  // wrangler prepends banner text; extract the JSON payload — it's always an
  // array that starts with '['. Fall through to parsing from the first '[' to
  // the matching end of the document.
  const firstBracket = stdout.indexOf('[');
  if (firstBracket === -1) {
    throw new Error(`d1.execSql: no JSON array in output:\n${stdout}`);
  }
  const payload = stdout.slice(firstBracket);
  let parsed: D1ExecResult[];
  try {
    parsed = JSON.parse(payload) as D1ExecResult[];
  } catch (err) {
    throw new Error(`d1.execSql: failed to parse JSON: ${(err as Error).message}\nPayload:\n${payload}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [];
  }
  const first = parsed[0];
  if (!first.success) {
    throw new Error(`d1.execSql: query failed: ${first.error ?? 'unknown error'}`);
  }
  return first.results ?? [];
}

/**
 * Escape a single-quoted SQL literal. Only use for test-authored strings.
 * Rejects ASCII control chars (0x00-0x1f, 0x7f) to keep wrangler's shell
 * quoting well-behaved — test inputs should never contain these anyway.
 */
export function escapeSqlString(input: string): string {
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      throw new Error(`d1.escapeSqlString: control character (0x${code.toString(16)}) not allowed`);
    }
  }
  return input.replace(/'/g, "''");
}
