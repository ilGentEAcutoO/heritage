ALTER TABLE `people` ADD `deceased` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill: existing rows with a recorded death year are deceased.
UPDATE `people` SET `deceased` = 1 WHERE `died` IS NOT NULL;