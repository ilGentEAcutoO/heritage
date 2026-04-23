import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Users & Trees
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  display_name: text('display_name'),
  created_at: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  // Auth columns added in migration 0002
  password_hash: text('password_hash'),
  password_salt: text('password_salt'),
  failed_login_count: integer('failed_login_count').notNull().default(0),
  locked_until: integer('locked_until'),
  email_verified_at: integer('email_verified_at'),
});

export const trees = sqliteTable(
  'trees',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    name_en: text('name_en'),
    owner_id: text('owner_id').references(() => users.id),
    is_public: integer('is_public', { mode: 'boolean' }).notNull().default(false),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    // Visibility replaces is_public (is_public retained for backward compat — drop deferred)
    visibility: text('visibility', { enum: ['public', 'private', 'shared'] })
      .notNull()
      .default('public'),
  },
  (t) => ({
    slugIdx: index('idx_trees_slug').on(t.slug),
  }),
);

export const tree_members = sqliteTable('tree_members', {
  id: text('id').primaryKey(),
  tree_id: text('tree_id')
    .notNull()
    .references(() => trees.id),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id),
  role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull(),
  created_at: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// People & Relations
// ---------------------------------------------------------------------------

export const people = sqliteTable(
  'people',
  {
    id: text('id').primaryKey(),
    tree_id: text('tree_id')
      .notNull()
      .references(() => trees.id),
    name: text('name').notNull(),
    name_en: text('name_en'),
    nick: text('nick'),
    born: integer('born'),
    died: integer('died'),
    gender: text('gender', { enum: ['m', 'f'] }),
    hometown: text('hometown'),
    is_me: integer('is_me', { mode: 'boolean' }).notNull().default(false),
    external: integer('external', { mode: 'boolean' }).notNull().default(false),
    avatar_key: text('avatar_key'),
    extra: text('extra', { mode: 'json' }),
  },
  (t) => ({
    treeIdIdx: index('idx_people_tree_id').on(t.tree_id),
  }),
);

export const relations = sqliteTable(
  'relations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tree_id: text('tree_id')
      .notNull()
      .references(() => trees.id),
    from_id: text('from_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    to_id: text('to_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['parent', 'spouse'] }).notNull(),
  },
  (t) => ({
    treeFromIdx: index('idx_relations_tree_from').on(t.tree_id, t.from_id),
    treeToIdx: index('idx_relations_tree_to').on(t.tree_id, t.to_id),
  }),
);

// ---------------------------------------------------------------------------
// Stories, Memos, Photos
// ---------------------------------------------------------------------------

export const stories = sqliteTable(
  'stories',
  {
    id: text('id').primaryKey(),
    person_id: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    year: integer('year'),
    title: text('title'),
    body: text('body'),
    created_by: text('created_by').references(() => users.id),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    personIdIdx: index('idx_stories_person_id').on(t.person_id),
  }),
);

export const memos = sqliteTable('memos', {
  id: text('id').primaryKey(),
  person_id: text('person_id')
    .notNull()
    .references(() => people.id, { onDelete: 'cascade' }),
  by_id: text('by_id').references(() => people.id),
  duration: integer('duration'),
  title: text('title'),
  recorded_on: text('recorded_on'),
  object_key: text('object_key'),
});

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  person_id: text('person_id')
    .notNull()
    .references(() => people.id, { onDelete: 'cascade' }),
  object_key: text('object_key').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  uploaded_by: text('uploaded_by').references(() => users.id),
  created_at: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Lineages
// ---------------------------------------------------------------------------

export const lineages = sqliteTable('lineages', {
  id: text('id').primaryKey(),
  bridge_person_id: text('bridge_person_id')
    .notNull()
    .references(() => people.id, { onDelete: 'cascade' }),
  family: text('family'),
  family_en: text('family_en'),
  code: text('code').notNull().unique(),
  linked_tree_id: text('linked_tree_id').references(() => trees.id),
});

export const lineage_members = sqliteTable(
  'lineage_members',
  {
    id: text('id').primaryKey(),
    lineage_id: text('lineage_id')
      .notNull()
      .references(() => lineages.id, { onDelete: 'cascade' }),
    person_data: text('person_data', { mode: 'json' }),
  },
  (t) => ({
    lineageIdIdx: index('idx_lineage_members_lineage_id').on(t.lineage_id),
  }),
);

// ---------------------------------------------------------------------------
// Position Overrides
// ---------------------------------------------------------------------------

export const position_overrides = sqliteTable(
  'position_overrides',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    tree_id: text('tree_id')
      .notNull()
      .references(() => trees.id),
    person_id: text('person_id')
      .notNull()
      .references(() => people.id),
    dx: real('dx'),
    dy: real('dy'),
    updated_at: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    userPersonUniq: uniqueIndex('idx_pos_overrides_user_person').on(t.user_id, t.person_id),
  }),
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const auth_tokens = sqliteTable(
  'auth_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    token_hash: text('token_hash').notNull().unique(),
    email: text('email'),
    expires_at: integer('expires_at'),
    used_at: integer('used_at'),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    // kind distinguishes signup-verification vs password-reset tokens
    kind: text('kind', { enum: ['verify', 'reset'] }).notNull().default('verify'),
  },
  (t) => ({
    hashIdx: index('idx_auth_tokens_hash').on(t.token_hash),
  }),
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token_hash: text('token_hash').notNull().unique(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires_at: integer('expires_at'),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    user_agent: text('user_agent'),
    ip: text('ip'),
  },
  (t) => ({
    tokenHashIdx: index('idx_sessions_token_hash').on(t.token_hash),
  }),
);

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export const tree_shares = sqliteTable(
  'tree_shares',
  {
    id: text('id').primaryKey(),
    tree_id: text('tree_id')
      .notNull()
      .references(() => trees.id, { onDelete: 'cascade' }),
    // email stored lowercase by app convention
    email: text('email').notNull(),
    user_id: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    role: text('role', { enum: ['viewer', 'editor'] }).notNull().default('viewer'),
    status: text('status', { enum: ['pending', 'accepted', 'revoked'] })
      .notNull()
      .default('pending'),
    invited_by: text('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    created_at: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    accepted_at: integer('accepted_at'),
  },
  (t) => ({
    // Note: the UNIQUE INDEX on (tree_id, lower(email)) is a SQLite expression index
    // and cannot be expressed in drizzle-kit schema — it is hand-written in the migration SQL.
    treeIdIdx: index('idx_tree_shares_tree_id').on(t.tree_id),
    userIdIdx: index('idx_tree_shares_user_id').on(t.user_id),
  }),
);
