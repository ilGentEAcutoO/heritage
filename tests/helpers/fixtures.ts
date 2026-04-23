/**
 * Shared test fixtures for integration tests.
 *
 * Each helper is stateless (no globals) and idempotent per call — safe to use
 * in concurrent or repeated beforeEach blocks.
 *
 * Requires the DB produced by `drizzle(d1, { schema })` — the same shape as
 * `c.var.db` in the running worker.
 */

import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../src/db/schema';
import { hashPassword } from '../../src/worker/lib/password';
import { createSessionToken } from '../../src/worker/lib/tokens';
import type { SqliteD1Database } from './sqlite-d1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

export interface SeededUser {
  id: string;
  email: string;
  /** The plain-text password passed in (or the generated default) */
  password: string;
  passwordHash: string;
  passwordSalt: string;
}

export interface SeededSession {
  /** The opaque token sent in the cookie */
  raw: string;
  /** SHA-256 hex of raw — what is stored in the sessions table */
  tokenHash: string;
  /** Ready-to-use Cookie header value: `__Host-session=<raw>` */
  cookieHeader: string;
}

export interface SeededShare {
  id: string;
  tree_id: string;
  email: string;
  user_id: string | null;
  role: 'viewer' | 'editor';
  status: 'pending' | 'accepted' | 'revoked';
  invited_by: string;
  created_at: Date | null;
  accepted_at: number | null;
}

// ---------------------------------------------------------------------------
// seedUser
// ---------------------------------------------------------------------------

export interface SeedUserOptions {
  email: string;
  password?: string;
  verified?: boolean;
  displayName?: string;
}

/**
 * Insert a user row with a hashed password. Returns the user's id, email,
 * plain-text password, and the hash/salt written to the DB.
 *
 * @param d1 - the SqliteD1Database shim (will be wrapped in drizzle internally)
 * @param opts - email is required; password defaults to a known value
 */
export async function seedUser(
  d1: SqliteD1Database,
  opts: SeedUserOptions,
): Promise<SeededUser> {
  const db: DrizzleDB = drizzle(d1 as unknown as D1Database, { schema });

  const plain = opts.password ?? 'Test1234!secret';
  const { hash, salt } = await hashPassword(plain);
  const id = crypto.randomUUID();

  await db.insert(schema.users).values({
    id,
    email: opts.email.toLowerCase(),
    display_name: opts.displayName ?? null,
    password_hash: hash,
    password_salt: salt,
    email_verified_at: opts.verified !== false
      ? Math.floor(Date.now() / 1000)
      : null,
  });

  return {
    id,
    email: opts.email.toLowerCase(),
    password: plain,
    passwordHash: hash,
    passwordSalt: salt,
  };
}

// ---------------------------------------------------------------------------
// seedSession
// ---------------------------------------------------------------------------

export interface SeedSessionOptions {
  /** Unix epoch seconds; defaults to now + 14 days */
  expiresAtSeconds?: number;
}

/**
 * Insert a session row for the given userId. Returns the raw token (for the
 * cookie), its hash (stored in DB), and a ready-made Cookie header string.
 *
 * @param d1 - the SqliteD1Database shim
 * @param userId - must already exist in the users table
 */
export async function seedSession(
  d1: SqliteD1Database,
  userId: string,
  opts: SeedSessionOptions = {},
): Promise<SeededSession> {
  const db: DrizzleDB = drizzle(d1 as unknown as D1Database, { schema });

  const { raw, hash: tokenHash } = createSessionToken();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = opts.expiresAtSeconds ?? now + 60 * 60 * 24 * 14;
  const sessionId = crypto.randomUUID();

  await db.insert(schema.sessions).values({
    id: sessionId,
    token_hash: tokenHash,
    user_id: userId,
    expires_at: expiresAt,
  });

  return {
    raw,
    tokenHash,
    cookieHeader: `__Host-session=${raw}`,
  };
}

// ---------------------------------------------------------------------------
// seedShare
// ---------------------------------------------------------------------------

export interface SeedShareOptions {
  treeId: string;
  email: string;
  invitedBy: string;
  role?: 'viewer' | 'editor';
  status?: 'pending' | 'accepted' | 'revoked';
  userId?: string | null;
}

/**
 * Insert a tree_shares row and return the inserted record.
 *
 * @param d1 - the SqliteD1Database shim
 * @param opts - treeId, email, and invitedBy are required
 */
// ---------------------------------------------------------------------------
// seedPrivateTree
// ---------------------------------------------------------------------------

export interface SeedPrivateTreeOptions {
  treeId?: string;
  slug?: string;
  name?: string;
  /** Required — user must already exist */
  ownerId: string;
}

export interface SeededTree {
  treeId: string;
  slug: string;
}

/**
 * Insert a trees row with visibility='private', plus a tree_members owner row.
 */
export async function seedPrivateTree(
  d1: SqliteD1Database,
  opts: SeedPrivateTreeOptions,
): Promise<SeededTree> {
  const db: DrizzleDB = drizzle(d1 as unknown as D1Database, { schema });

  const treeId = opts.treeId ?? crypto.randomUUID();
  const slug = opts.slug ?? `priv-${treeId.slice(0, 8)}`;
  const name = opts.name ?? 'Private Tree';

  await db.insert(schema.trees).values({
    id: treeId,
    slug,
    name,
    owner_id: opts.ownerId,
    visibility: 'private',
  });

  await db.insert(schema.tree_members).values({
    id: crypto.randomUUID(),
    tree_id: treeId,
    user_id: opts.ownerId,
    role: 'owner',
  });

  return { treeId, slug };
}

// ---------------------------------------------------------------------------
// seedSharedTree
// ---------------------------------------------------------------------------

export interface SeedSharedTreeOptions {
  treeId?: string;
  slug?: string;
  name?: string;
  /** Required — user must already exist */
  ownerId: string;
  /** Users who already accepted a share (have user_id + status='accepted') */
  acceptedShareUserIds?: string[];
  /** Users with status='pending' */
  pendingShareUserIds?: string[];
  /** Email-only accepted shares (no user_id) */
  acceptedShareEmails?: string[];
}

/**
 * Insert a trees row with visibility='shared', tree_members owner row, and
 * tree_shares rows per the accepted/pending arrays.
 */
export async function seedSharedTree(
  d1: SqliteD1Database,
  opts: SeedSharedTreeOptions,
): Promise<SeededTree> {
  const db: DrizzleDB = drizzle(d1 as unknown as D1Database, { schema });

  const treeId = opts.treeId ?? crypto.randomUUID();
  const slug = opts.slug ?? `shared-${treeId.slice(0, 8)}`;
  const name = opts.name ?? 'Shared Tree';

  await db.insert(schema.trees).values({
    id: treeId,
    slug,
    name,
    owner_id: opts.ownerId,
    visibility: 'shared',
  });

  await db.insert(schema.tree_members).values({
    id: crypto.randomUUID(),
    tree_id: treeId,
    user_id: opts.ownerId,
    role: 'owner',
  });

  const now = Math.floor(Date.now() / 1000);

  for (const userId of opts.acceptedShareUserIds ?? []) {
    await db.insert(schema.tree_shares).values({
      id: crypto.randomUUID(),
      tree_id: treeId,
      email: `${userId}@share.test`,
      user_id: userId,
      role: 'viewer',
      status: 'accepted',
      invited_by: opts.ownerId,
      accepted_at: now,
    });
  }

  for (const userId of opts.pendingShareUserIds ?? []) {
    await db.insert(schema.tree_shares).values({
      id: crypto.randomUUID(),
      tree_id: treeId,
      email: `${userId}@share.test`,
      user_id: userId,
      role: 'viewer',
      status: 'pending',
      invited_by: opts.ownerId,
      accepted_at: null,
    });
  }

  for (const email of opts.acceptedShareEmails ?? []) {
    await db.insert(schema.tree_shares).values({
      id: crypto.randomUUID(),
      tree_id: treeId,
      email,
      user_id: null,
      role: 'viewer',
      status: 'accepted',
      invited_by: opts.ownerId,
      accepted_at: now,
    });
  }

  return { treeId, slug };
}

// ---------------------------------------------------------------------------
// seedShare
// ---------------------------------------------------------------------------

export async function seedShare(
  d1: SqliteD1Database,
  opts: SeedShareOptions,
): Promise<SeededShare> {
  const db: DrizzleDB = drizzle(d1 as unknown as D1Database, { schema });

  const id = crypto.randomUUID();
  const role = opts.role ?? 'viewer';
  const status = opts.status ?? 'pending';
  const email = opts.email.toLowerCase();
  const acceptedAt =
    status === 'accepted' ? Math.floor(Date.now() / 1000) : null;

  await db.insert(schema.tree_shares).values({
    id,
    tree_id: opts.treeId,
    email,
    user_id: opts.userId ?? null,
    role,
    status,
    invited_by: opts.invitedBy,
    accepted_at: acceptedAt,
  });

  return {
    id,
    tree_id: opts.treeId,
    email,
    user_id: opts.userId ?? null,
    role,
    status,
    invited_by: opts.invitedBy,
    created_at: null,
    accepted_at: acceptedAt,
  };
}
