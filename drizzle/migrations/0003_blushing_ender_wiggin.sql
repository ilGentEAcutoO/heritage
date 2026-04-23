-- Drops deprecated trees.is_public column (see TASK-S2).
-- All readers now use trees.visibility (enum: public|private|shared).
-- Backfill from is_public was done in migration 0002.
ALTER TABLE `trees` DROP COLUMN `is_public`;