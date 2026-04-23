-- Extend auth_tokens.kind CHECK to include 'magic' for magic-link login.
-- Follows the same 3-phase table-rebuild pattern as migration 0004 because
-- D1 (SQLite) does not support ALTER COLUMN to change CHECK constraints.
-- auth_tokens has no FK dependencies so no child tables need rebuilding.

CREATE TABLE `__new_auth_tokens` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `token_hash` text NOT NULL,
  `email` text,
  `expires_at` integer,
  `used_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `kind` text DEFAULT 'verify' NOT NULL CHECK (`kind` IN ('verify','reset','magic'))
);
--> statement-breakpoint
INSERT INTO `__new_auth_tokens` (`id`, `token_hash`, `email`, `expires_at`, `used_at`, `created_at`, `kind`)
  SELECT `id`, `token_hash`, `email`, `expires_at`, `used_at`, `created_at`, `kind` FROM `auth_tokens`;
--> statement-breakpoint
DROP TABLE `auth_tokens`;
--> statement-breakpoint
ALTER TABLE `__new_auth_tokens` RENAME TO `auth_tokens`;
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_hash_unique` ON `auth_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_hash` ON `auth_tokens` (`token_hash`);
