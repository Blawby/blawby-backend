-- Rename user_details table to preferences
ALTER TABLE "user_details" RENAME TO "preferences";--> statement-breakpoint

-- Drop old constraints (only if they exist)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.table_constraints WHERE constraint_name = 'user_details_user_id_unique' AND table_name = 'preferences') THEN
        ALTER TABLE "preferences" DROP CONSTRAINT "user_details_user_id_unique";
    END IF;
    IF EXISTS (SELECT FROM information_schema.table_constraints WHERE constraint_name = 'user_details_stripe_customer_id_unique' AND table_name = 'preferences') THEN
        ALTER TABLE "preferences" DROP CONSTRAINT "user_details_stripe_customer_id_unique";
    END IF;
    IF EXISTS (SELECT FROM information_schema.table_constraints WHERE constraint_name = 'user_details_user_id_users_id_fk' AND table_name = 'preferences') THEN
        ALTER TABLE "preferences" DROP CONSTRAINT "user_details_user_id_users_id_fk";
    END IF;
END $$;--> statement-breakpoint

-- Drop old indexes
DROP INDEX IF EXISTS "user_details_user_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "user_details_stripe_customer_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "user_details_created_at_idx";--> statement-breakpoint

-- Add new columns to users table (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'primary_workspace') THEN
        ALTER TABLE "users" ADD COLUMN "primary_workspace" text;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
        ALTER TABLE "users" ADD COLUMN "phone" text;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone_country_code') THEN
        ALTER TABLE "users" ADD COLUMN "phone_country_code" text;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'dob') THEN
        ALTER TABLE "users" ADD COLUMN "dob" date;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'stripe_customer_id') THEN
        ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;
    END IF;
END $$;--> statement-breakpoint


-- Add JSONB columns to preferences table (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'preferences' AND column_name = 'general') THEN
        ALTER TABLE "preferences" ADD COLUMN "general" jsonb DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'preferences' AND column_name = 'notifications') THEN
        ALTER TABLE "preferences" ADD COLUMN "notifications" jsonb DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'preferences' AND column_name = 'security') THEN
        ALTER TABLE "preferences" ADD COLUMN "security" jsonb DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'preferences' AND column_name = 'account') THEN
        ALTER TABLE "preferences" ADD COLUMN "account" jsonb DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'preferences' AND column_name = 'onboarding') THEN
        ALTER TABLE "preferences" ADD COLUMN "onboarding" jsonb DEFAULT '{}'::jsonb;
    END IF;
END $$;--> statement-breakpoint

-- Drop phone and dob columns from preferences (moved to users table)
-- Note: stripe_customer_id will be dropped in migration 0008 after data is migrated
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'preferences' AND column_name = 'phone') THEN
        ALTER TABLE "preferences" DROP COLUMN "phone";
    END IF;
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'preferences' AND column_name = 'dob') THEN
        ALTER TABLE "preferences" DROP COLUMN "dob";
    END IF;
END $$;--> statement-breakpoint

-- Add new constraints (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.table_constraints WHERE constraint_name = 'preferences_user_id_users_id_fk' AND table_name = 'preferences') THEN
        ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.table_constraints WHERE constraint_name = 'preferences_user_id_unique' AND table_name = 'preferences') THEN
        ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_unique" UNIQUE("user_id");
    END IF;
END $$;--> statement-breakpoint

-- Note: stripe_customer_id unique constraint and index will be added in migration 0008
-- after data is migrated from preferences to users

-- Create new indexes
CREATE INDEX IF NOT EXISTS "preferences_user_idx" ON "preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "preferences_created_at_idx" ON "preferences" USING btree ("created_at");--> statement-breakpoint

-- Fix practice_details id column
ALTER TABLE "practice_details" ALTER COLUMN "id" DROP DEFAULT;
