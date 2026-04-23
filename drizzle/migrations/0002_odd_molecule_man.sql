CREATE TABLE `tree_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`tree_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`tree_id`) REFERENCES `trees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tree_shares_tree_id` ON `tree_shares` (`tree_id`);--> statement-breakpoint
CREATE INDEX `idx_tree_shares_user_id` ON `tree_shares` (`user_id`);--> statement-breakpoint
ALTER TABLE `auth_tokens` ADD `kind` text DEFAULT 'verify' NOT NULL;--> statement-breakpoint
ALTER TABLE `trees` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `users` ADD `failed_login_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;--> statement-breakpoint
CREATE INDEX `idx_lineage_members_lineage_id` ON `lineage_members` (`lineage_id`);--> statement-breakpoint
-- Backfill: derive visibility from existing is_public flag
UPDATE `trees` SET `visibility` = CASE WHEN `is_public` = 1 THEN 'public' ELSE 'private' END;--> statement-breakpoint
-- Manually added: drizzle-kit does not emit SQLite expression indexes
-- Case-insensitive uniqueness on (tree_id, email)
CREATE UNIQUE INDEX `idx_tree_shares_tree_email` ON `tree_shares` (`tree_id`, lower(`email`));--> statement-breakpoint
-- Fast lookup by lower(email) across all trees
CREATE INDEX `idx_tree_shares_email_lower` ON `tree_shares` (lower(`email`));