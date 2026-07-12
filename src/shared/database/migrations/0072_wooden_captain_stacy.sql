ALTER TABLE "practice_details" ADD COLUMN "enabled_skills" jsonb DEFAULT '["matter_management","billing","client_intake"]'::jsonb NOT NULL;
