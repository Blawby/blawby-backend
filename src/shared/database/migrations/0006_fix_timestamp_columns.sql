-- Fix timestamp columns to match schema
-- Remove timezone and use regular timestamp

ALTER TABLE "user_details" ALTER COLUMN "created_at" SET DATA TYPE timestamp;
ALTER TABLE "user_details" ALTER COLUMN "updated_at" SET DATA TYPE timestamp;
