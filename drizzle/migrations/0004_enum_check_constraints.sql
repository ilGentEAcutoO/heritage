-- Add CHECK constraints on enum columns so direct wrangler d1 execute writes
-- with invalid values are rejected at the DB boundary. drizzle-kit does not
-- emit CHECK clauses from TS enum types, so this migration is hand-written.
-- Depends on migration 0003 having already removed trees.is_public.
--
-- Because Cloudflare D1 (and wrangler local) does not honour PRAGMA foreign_keys=OFF
-- per-statement, we perform the table-rebuild dance in strict dependency order:
-- drop leaf/child tables first, rebuild from innermost to outermost, then restore
-- all intermediate tables that have no enum changes.

-- ============================================================
-- PHASE 1: Stage new versions of all affected tables
-- ============================================================

-- ----- __new_trees (visibility CHECK) -----
CREATE TABLE `__new_trees` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `name_en` text,
  `owner_id` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `visibility` text DEFAULT 'public' NOT NULL
    CHECK (`visibility` IN ('public','private','shared')),
  FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_trees` (`id`, `slug`, `name`, `name_en`, `owner_id`, `created_at`, `visibility`)
  SELECT `id`, `slug`, `name`, `name_en`, `owner_id`, `created_at`, `visibility` FROM `trees`;
--> statement-breakpoint

-- ----- __new_people (gender CHECK — nullable) -----
CREATE TABLE `__new_people` (
  `id` text PRIMARY KEY NOT NULL,
  `tree_id` text NOT NULL,
  `name` text NOT NULL,
  `name_en` text,
  `nick` text,
  `born` integer,
  `died` integer,
  `gender` text CHECK (`gender` IS NULL OR `gender` IN ('m','f')),
  `hometown` text,
  `is_me` integer DEFAULT false NOT NULL,
  `external` integer DEFAULT false NOT NULL,
  `avatar_key` text,
  `extra` text,
  FOREIGN KEY (`tree_id`) REFERENCES `__new_trees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_people` (`id`, `tree_id`, `name`, `name_en`, `nick`, `born`, `died`, `gender`, `hometown`, `is_me`, `external`, `avatar_key`, `extra`)
  SELECT `id`, `tree_id`, `name`, `name_en`, `nick`, `born`, `died`, `gender`, `hometown`, `is_me`, `external`, `avatar_key`, `extra` FROM `people`;
--> statement-breakpoint

-- ----- Stage intermediate tables that reference people/trees (no enum changes) -----
-- These must be recreated to point at __new_trees / __new_people during the transition.

CREATE TABLE `__new_lineages` (
  `id` text PRIMARY KEY NOT NULL,
  `bridge_person_id` text NOT NULL,
  `family` text,
  `family_en` text,
  `code` text NOT NULL,
  `linked_tree_id` text,
  FOREIGN KEY (`bridge_person_id`) REFERENCES `__new_people`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`linked_tree_id`) REFERENCES `__new_trees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_lineages` (`id`, `bridge_person_id`, `family`, `family_en`, `code`, `linked_tree_id`)
  SELECT `id`, `bridge_person_id`, `family`, `family_en`, `code`, `linked_tree_id` FROM `lineages`;
--> statement-breakpoint

CREATE TABLE `__new_lineage_members` (
  `id` text PRIMARY KEY NOT NULL,
  `lineage_id` text NOT NULL,
  `person_data` text,
  FOREIGN KEY (`lineage_id`) REFERENCES `__new_lineages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_lineage_members` (`id`, `lineage_id`, `person_data`)
  SELECT `id`, `lineage_id`, `person_data` FROM `lineage_members`;
--> statement-breakpoint

CREATE TABLE `__new_stories` (
  `id` text PRIMARY KEY NOT NULL,
  `person_id` text NOT NULL,
  `year` integer,
  `title` text,
  `body` text,
  `created_by` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`person_id`) REFERENCES `__new_people`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_stories` (`id`, `person_id`, `year`, `title`, `body`, `created_by`, `created_at`)
  SELECT `id`, `person_id`, `year`, `title`, `body`, `created_by`, `created_at` FROM `stories`;
--> statement-breakpoint

CREATE TABLE `__new_memos` (
  `id` text PRIMARY KEY NOT NULL,
  `person_id` text NOT NULL,
  `by_id` text,
  `duration` integer,
  `title` text,
  `recorded_on` text,
  `object_key` text,
  FOREIGN KEY (`person_id`) REFERENCES `__new_people`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`by_id`) REFERENCES `__new_people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_memos` (`id`, `person_id`, `by_id`, `duration`, `title`, `recorded_on`, `object_key`)
  SELECT `id`, `person_id`, `by_id`, `duration`, `title`, `recorded_on`, `object_key` FROM `memos`;
--> statement-breakpoint

CREATE TABLE `__new_photos` (
  `id` text PRIMARY KEY NOT NULL,
  `person_id` text NOT NULL,
  `object_key` text NOT NULL,
  `mime` text NOT NULL,
  `bytes` integer NOT NULL,
  `uploaded_by` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`person_id`) REFERENCES `__new_people`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_photos` (`id`, `person_id`, `object_key`, `mime`, `bytes`, `uploaded_by`, `created_at`)
  SELECT `id`, `person_id`, `object_key`, `mime`, `bytes`, `uploaded_by`, `created_at` FROM `photos`;
--> statement-breakpoint

CREATE TABLE `__new_position_overrides` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `tree_id` text NOT NULL,
  `person_id` text NOT NULL,
  `dx` real,
  `dy` real,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`tree_id`) REFERENCES `__new_trees`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`person_id`) REFERENCES `__new_people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_position_overrides` (`id`, `user_id`, `tree_id`, `person_id`, `dx`, `dy`, `updated_at`)
  SELECT `id`, `user_id`, `tree_id`, `person_id`, `dx`, `dy`, `updated_at` FROM `position_overrides`;
--> statement-breakpoint

-- ----- __new_relations (kind CHECK) -----
CREATE TABLE `__new_relations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `tree_id` text NOT NULL,
  `from_id` text NOT NULL,
  `to_id` text NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('parent','spouse')),
  FOREIGN KEY (`tree_id`) REFERENCES `__new_trees`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`from_id`) REFERENCES `__new_people`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`to_id`) REFERENCES `__new_people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_relations` (`id`, `tree_id`, `from_id`, `to_id`, `kind`)
  SELECT `id`, `tree_id`, `from_id`, `to_id`, `kind` FROM `relations`;
--> statement-breakpoint

-- ----- __new_tree_members (role CHECK) -----
CREATE TABLE `__new_tree_members` (
  `id` text PRIMARY KEY NOT NULL,
  `tree_id` text NOT NULL,
  `user_id` text NOT NULL,
  `role` text NOT NULL CHECK (`role` IN ('owner','editor','viewer')),
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`tree_id`) REFERENCES `__new_trees`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tree_members` (`id`, `tree_id`, `user_id`, `role`, `created_at`)
  SELECT `id`, `tree_id`, `user_id`, `role`, `created_at` FROM `tree_members`;
--> statement-breakpoint

-- ----- __new_tree_shares (role + status CHECK) -----
CREATE TABLE `__new_tree_shares` (
  `id` text PRIMARY KEY NOT NULL,
  `tree_id` text NOT NULL,
  `email` text NOT NULL,
  `user_id` text,
  `role` text DEFAULT 'viewer' NOT NULL CHECK (`role` IN ('viewer','editor')),
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending','accepted','revoked')),
  `invited_by` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `accepted_at` integer,
  FOREIGN KEY (`tree_id`) REFERENCES `__new_trees`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tree_shares` (`id`, `tree_id`, `email`, `user_id`, `role`, `status`, `invited_by`, `created_at`, `accepted_at`)
  SELECT `id`, `tree_id`, `email`, `user_id`, `role`, `status`, `invited_by`, `created_at`, `accepted_at` FROM `tree_shares`;
--> statement-breakpoint

-- ----- __new_auth_tokens (kind CHECK) -----
CREATE TABLE `__new_auth_tokens` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `token_hash` text NOT NULL,
  `email` text,
  `expires_at` integer,
  `used_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `kind` text DEFAULT 'verify' NOT NULL CHECK (`kind` IN ('verify','reset'))
);
--> statement-breakpoint
INSERT INTO `__new_auth_tokens` (`id`, `token_hash`, `email`, `expires_at`, `used_at`, `created_at`, `kind`)
  SELECT `id`, `token_hash`, `email`, `expires_at`, `used_at`, `created_at`, `kind` FROM `auth_tokens`;
--> statement-breakpoint

-- ============================================================
-- PHASE 2: Drop old tables in strict child-before-parent order
-- ============================================================

-- Deepest leaves first
DROP TABLE `lineage_members`;
--> statement-breakpoint
DROP TABLE `lineages`;
--> statement-breakpoint
DROP TABLE `memos`;
--> statement-breakpoint
DROP TABLE `stories`;
--> statement-breakpoint
DROP TABLE `photos`;
--> statement-breakpoint
DROP TABLE `position_overrides`;
--> statement-breakpoint
DROP TABLE `relations`;
--> statement-breakpoint
DROP TABLE `tree_members`;
--> statement-breakpoint
DROP TABLE `tree_shares`;
--> statement-breakpoint
-- people is now safe to drop (all children gone)
DROP TABLE `people`;
--> statement-breakpoint
-- trees is now safe to drop (all children gone)
DROP TABLE `trees`;
--> statement-breakpoint
-- auth_tokens has no FK dependencies
DROP TABLE `auth_tokens`;
--> statement-breakpoint

-- ============================================================
-- PHASE 3: Rename __new_* to final names
-- ============================================================

ALTER TABLE `__new_trees` RENAME TO `trees`;
--> statement-breakpoint
CREATE UNIQUE INDEX `trees_slug_unique` ON `trees` (`slug`);
--> statement-breakpoint
CREATE INDEX `idx_trees_slug` ON `trees` (`slug`);
--> statement-breakpoint

ALTER TABLE `__new_people` RENAME TO `people`;
--> statement-breakpoint
CREATE INDEX `idx_people_tree_id` ON `people` (`tree_id`);
--> statement-breakpoint

ALTER TABLE `__new_lineages` RENAME TO `lineages`;
--> statement-breakpoint
CREATE UNIQUE INDEX `lineages_code_unique` ON `lineages` (`code`);
--> statement-breakpoint

ALTER TABLE `__new_lineage_members` RENAME TO `lineage_members`;
--> statement-breakpoint
CREATE INDEX `idx_lineage_members_lineage_id` ON `lineage_members` (`lineage_id`);
--> statement-breakpoint

ALTER TABLE `__new_stories` RENAME TO `stories`;
--> statement-breakpoint
CREATE INDEX `idx_stories_person_id` ON `stories` (`person_id`);
--> statement-breakpoint

ALTER TABLE `__new_memos` RENAME TO `memos`;
--> statement-breakpoint

ALTER TABLE `__new_photos` RENAME TO `photos`;
--> statement-breakpoint

ALTER TABLE `__new_position_overrides` RENAME TO `position_overrides`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pos_overrides_user_person` ON `position_overrides` (`user_id`, `person_id`);
--> statement-breakpoint

ALTER TABLE `__new_relations` RENAME TO `relations`;
--> statement-breakpoint
CREATE INDEX `idx_relations_tree_from` ON `relations` (`tree_id`, `from_id`);
--> statement-breakpoint
CREATE INDEX `idx_relations_tree_to` ON `relations` (`tree_id`, `to_id`);
--> statement-breakpoint

ALTER TABLE `__new_tree_members` RENAME TO `tree_members`;
--> statement-breakpoint

ALTER TABLE `__new_tree_shares` RENAME TO `tree_shares`;
--> statement-breakpoint
CREATE INDEX `idx_tree_shares_tree_id` ON `tree_shares` (`tree_id`);
--> statement-breakpoint
CREATE INDEX `idx_tree_shares_user_id` ON `tree_shares` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tree_shares_tree_email` ON `tree_shares` (`tree_id`, lower(`email`));
--> statement-breakpoint
CREATE INDEX `idx_tree_shares_email_lower` ON `tree_shares` (lower(`email`));
--> statement-breakpoint

ALTER TABLE `__new_auth_tokens` RENAME TO `auth_tokens`;
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_hash_unique` ON `auth_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_hash` ON `auth_tokens` (`token_hash`);
