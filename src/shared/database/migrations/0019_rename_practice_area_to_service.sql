-- Rename practice_area_id to service_id in matters table
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matters' AND column_name = 'practice_area_id') THEN
        ALTER TABLE "matters" RENAME COLUMN "practice_area_id" TO "service_id";
    END IF;
END $$;

-- Drop the old index and create the new one
DROP INDEX IF EXISTS "matters_practice_area_idx";
CREATE INDEX IF NOT EXISTS "matters_service_idx" ON "matters" ( "service_id" );

-- Remove foreign key constraint
ALTER TABLE "matters" DROP CONSTRAINT IF EXISTS "matters_practice_area_id_practice_areas_id_fk";

-- Drop practice_areas table
DROP TABLE IF EXISTS "practice_areas";