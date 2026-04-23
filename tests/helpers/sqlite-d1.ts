/**
 * sqlite-d1.ts — A D1Database-compatible shim built on better-sqlite3.
 *
 * Drizzle's D1 session calls:
 *   client.prepare(sql) → D1PreparedStatement
 *   D1PreparedStatement.bind(...params) → D1PreparedStatement (returns self-like, chainable)
 *   D1PreparedStatement.all() → Promise<{ results, success, meta }>
 *   D1PreparedStatement.first() → Promise<Record | null>
 *   D1PreparedStatement.run() → Promise<{ results, success, meta }>
 *   client.batch([stmts]) → Promise<D1Result[]>
 */

import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// D1Result shape Drizzle expects
// ---------------------------------------------------------------------------

interface D1Result {
  results: Record<string, unknown>[];
  success: boolean;
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Prepared statement shim
// ---------------------------------------------------------------------------

class SqliteD1Statement {
  _sql: string;
  private _db: Database.Database;
  _params: unknown[];

  constructor(db: Database.Database, sql: string, params: unknown[] = []) {
    this._db = db;
    this._sql = sql;
    this._params = params;
  }

  bind(...params: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this._db, this._sql, params);
  }

  async all(): Promise<D1Result> {
    const stmt = this._db.prepare(this._sql);
    const results = (stmt.all(...this._params) as Record<string, unknown>[]);
    return { results, success: true, meta: {} };
  }

  async first(): Promise<Record<string, unknown> | null> {
    const stmt = this._db.prepare(this._sql);
    const result = stmt.get(...this._params) as Record<string, unknown> | undefined;
    return result ?? null;
  }

  async run(): Promise<D1Result> {
    const stmt = this._db.prepare(this._sql);
    stmt.run(...this._params);
    return { results: [], success: true, meta: {} };
  }

  /**
   * raw() — Drizzle's D1 session calls this on the bound statement to get
   * rows as arrays (rather than objects). This is used by the `.values()` path
   * which powers `.get()` and `.all()` at the Drizzle ORM level.
   *
   * Returns a Promise-like object (async) to satisfy Drizzle's internal
   * `await this.stmt.bind(...params).raw()` usage.
   */
  raw(): Promise<unknown[][]> {
    const stmt = this._db.prepare(this._sql);
    // raw() on better-sqlite3 returns rows as arrays of values
    const rows = stmt.raw().all(...this._params) as unknown[][];
    return Promise.resolve(rows);
  }
}

// ---------------------------------------------------------------------------
// Database shim
// ---------------------------------------------------------------------------

export class SqliteD1Database {
  public readonly _sqlite: Database.Database;

  constructor(db: Database.Database) {
    this._sqlite = db;
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this._sqlite, sql);
  }

  async batch(statements: SqliteD1Statement[]): Promise<D1Result[]> {
    const results: D1Result[] = [];
    for (const stmt of statements) {
      const sql = stmt._sql.trim().toUpperCase();
      if (sql.startsWith('SELECT') || sql.startsWith('WITH')) {
        results.push(await stmt.all());
      } else {
        results.push(await stmt.run());
      }
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Schema DDL (mirrors schema.ts)
// ---------------------------------------------------------------------------

const INLINE_DDL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    password_hash TEXT,
    password_salt TEXT,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    email_verified_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS trees (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    name_en TEXT,
    owner_id TEXT REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    visibility TEXT NOT NULL DEFAULT 'public'
  );
  CREATE INDEX IF NOT EXISTS idx_trees_slug ON trees(slug);
  CREATE TABLE IF NOT EXISTS tree_members (
    id TEXT PRIMARY KEY,
    tree_id TEXT NOT NULL REFERENCES trees(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    tree_id TEXT NOT NULL REFERENCES trees(id),
    name TEXT NOT NULL,
    name_en TEXT,
    nick TEXT,
    born INTEGER,
    died INTEGER,
    gender TEXT CHECK(gender IN ('m','f')),
    hometown TEXT,
    is_me INTEGER NOT NULL DEFAULT 0,
    external INTEGER NOT NULL DEFAULT 0,
    avatar_key TEXT,
    extra TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_people_tree_id ON people(tree_id);
  CREATE TABLE IF NOT EXISTS relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tree_id TEXT NOT NULL REFERENCES trees(id),
    from_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    to_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('parent','spouse'))
  );
  CREATE INDEX IF NOT EXISTS idx_relations_tree_from ON relations(tree_id, from_id);
  CREATE INDEX IF NOT EXISTS idx_relations_tree_to ON relations(tree_id, to_id);
  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    year INTEGER,
    title TEXT,
    body TEXT,
    created_by TEXT REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_stories_person_id ON stories(person_id);
  CREATE TABLE IF NOT EXISTS memos (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    by_id TEXT REFERENCES people(id),
    duration INTEGER,
    title TEXT,
    recorded_on TEXT,
    object_key TEXT
  );
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    mime TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    uploaded_by TEXT REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS lineages (
    id TEXT PRIMARY KEY,
    bridge_person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    family TEXT,
    family_en TEXT,
    code TEXT NOT NULL UNIQUE,
    linked_tree_id TEXT REFERENCES trees(id)
  );
  CREATE TABLE IF NOT EXISTS lineage_members (
    id TEXT PRIMARY KEY,
    lineage_id TEXT NOT NULL REFERENCES lineages(id) ON DELETE CASCADE,
    person_data TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_lineage_members_lineage_id ON lineage_members(lineage_id);
  CREATE TABLE IF NOT EXISTS position_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    tree_id TEXT NOT NULL REFERENCES trees(id),
    person_id TEXT NOT NULL REFERENCES people(id),
    dx REAL,
    dy REAL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, person_id)
  );
  CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    email TEXT,
    expires_at INTEGER,
    used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    kind TEXT NOT NULL DEFAULT 'verify'
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    user_agent TEXT,
    ip TEXT
  );
  CREATE TABLE IF NOT EXISTS tree_shares (
    id TEXT PRIMARY KEY,
    tree_id TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    status TEXT NOT NULL DEFAULT 'pending',
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    accepted_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tree_shares_tree_email ON tree_shares (tree_id, lower(email));
  CREATE INDEX IF NOT EXISTS idx_tree_shares_tree_id ON tree_shares (tree_id);
  CREATE INDEX IF NOT EXISTS idx_tree_shares_user_id ON tree_shares (user_id);
  CREATE INDEX IF NOT EXISTS idx_tree_shares_email_lower ON tree_shares (lower(email));
`;

function applyMigrations(sqlite: Database.Database): void {
  const migrationsDir = join(ROOT, 'drizzle', 'migrations');
  let files: string[] = [];
  try {
    files = readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();
  } catch {
    sqlite.exec(INLINE_DDL);
    return;
  }

  if (files.length === 0) {
    sqlite.exec(INLINE_DDL);
    return;
  }

  for (const file of files) {
    const content = readFileSync(join(migrationsDir, file), 'utf8');
    try {
      sqlite.exec(content);
    } catch {
      const stmts = content
        .split(/;\s*\n/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && !s.startsWith('--'));
      for (const stmt of stmts) {
        try {
          sqlite.exec(stmt + ';');
        } catch {
          // ignore duplicate-index or already-exists errors
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a fresh in-memory SQLite D1 shim with schema applied.
 */
export function createSqliteD1(): SqliteD1Database {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  applyMigrations(sqlite);
  return new SqliteD1Database(sqlite);
}
