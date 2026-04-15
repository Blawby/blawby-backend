-- Fix dob column type to use date instead of timestamp
-- This ensures we only store the date without time information

ALTER TABLE "user_details" ALTER COLUMN "dob" SET DATA TYPE date;
