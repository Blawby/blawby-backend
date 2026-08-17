-- Restore the DB-level default that migration 0007 (0007_flashy_exiles.sql) dropped and no
-- later migration restored, even though schema.ts and the generated snapshots have declared
-- defaultRandom() ever since. Without this, any insert that omits `id` (the app's normal path
-- in practice-management.helpers.ts, and this migration matches what the Drizzle schema/snapshot
-- have already claimed as current state) fails with a NOT NULL violation on a freshly migrated
-- database.
ALTER TABLE "practice_details" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
