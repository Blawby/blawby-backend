-- Migration 0008: Move stripe_customer_id data from preferences to users table
-- This migration runs AFTER 0007 which added the column to users table
--
-- ROLLBACK (if needed):
-- 1. Re-add stripe_customer_id column to preferences
-- 2. Move data back from users to preferences
-- 3. Re-add constraints and indexes to preferences
-- 4. Remove stripe_customer_id from users (if it was added in 0007)
-- 5. Drop unique constraint and index from users

-- Step 0: Ensure stripe_customer_id column exists in users table (should be added in 0007, but check anyway)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'stripe_customer_id') THEN
        ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;
    END IF;
END $$;--> statement-breakpoint

-- Step 1: Move existing stripe_customer_id values from preferences to users
DO $$
BEGIN
    -- Copy stripe_customer_id from preferences to users for each user
    -- Only update users that don't already have a stripe_customer_id
    UPDATE "users"
    SET "stripe_customer_id" = "preferences"."stripe_customer_id"
    FROM "preferences"
    WHERE "users"."id" = "preferences"."user_id"
    AND "preferences"."stripe_customer_id" IS NOT NULL
    AND "users"."stripe_customer_id" IS NULL;
END $$;--> statement-breakpoint

-- Step 2: Drop stripe_customer_id column from preferences table
-- (phone and dob were already dropped in migration 0007)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'preferences' AND column_name = 'stripe_customer_id') THEN
        ALTER TABLE "preferences" DROP COLUMN "stripe_customer_id";
    END IF;
END $$;--> statement-breakpoint

-- Step 3: Drop old constraint and index from preferences (if they still exist)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.table_constraints WHERE constraint_name = 'preferences_stripe_customer_id_unique' AND table_name = 'preferences') THEN
        ALTER TABLE "preferences" DROP CONSTRAINT "preferences_stripe_customer_id_unique";
    END IF;
END $$;--> statement-breakpoint

DROP INDEX IF EXISTS "preferences_stripe_customer_idx";--> statement-breakpoint

-- Step 4: Add unique constraint for stripe_customer_id on users table (if not already added in 0007)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.table_constraints WHERE constraint_name = 'users_stripe_customer_id_unique' AND table_name = 'users') THEN
        ALTER TABLE "users" ADD CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id");
    END IF;
END $$;--> statement-breakpoint

-- Step 5: Create index on users.stripe_customer_id (if not already created in 0007)
CREATE INDEX IF NOT EXISTS "users_stripe_customer_idx" ON "users" USING btree ("stripe_customer_id");

-- ============================================================================
-- ROLLBACK SECTION (for manual use if needed)
-- ============================================================================
-- To rollback this migration, uncomment and run the following SQL:
--
-- -- Step 1: Re-add stripe_customer_id column to preferences table
-- DO $$
-- BEGIN
--     IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'preferences' AND column_name = 'stripe_customer_id') THEN
--         ALTER TABLE "preferences" ADD COLUMN "stripe_customer_id" text;
--     END IF;
-- END $$;
--
-- -- Step 2: Move data back from users to preferences
-- DO $$
-- BEGIN
--     UPDATE "preferences"
--     SET "stripe_customer_id" = "users"."stripe_customer_id"
--     FROM "users"
--     WHERE "preferences"."user_id" = "users"."id"
--     AND "users"."stripe_customer_id" IS NOT NULL
--     AND "preferences"."stripe_customer_id" IS NULL;
-- END $$;
--
-- -- Step 3: Re-add unique constraint to preferences
-- DO $$
-- BEGIN
--     IF NOT EXISTS (SELECT FROM information_schema.table_constraints WHERE constraint_name = 'preferences_stripe_customer_id_unique' AND table_name = 'preferences') THEN
--         ALTER TABLE "preferences" ADD CONSTRAINT "preferences_stripe_customer_id_unique" UNIQUE("stripe_customer_id");
--     END IF;
-- END $$;
--
-- -- Step 4: Re-create index on preferences
-- CREATE INDEX IF NOT EXISTS "preferences_stripe_customer_idx" ON "preferences" USING btree ("stripe_customer_id");
--
-- -- Step 5: Remove unique constraint from users
-- DO $$
-- BEGIN
--     IF EXISTS (SELECT FROM information_schema.table_constraints WHERE constraint_name = 'users_stripe_customer_id_unique' AND table_name = 'users') THEN
--         ALTER TABLE "users" DROP CONSTRAINT "users_stripe_customer_id_unique";
--     END IF;
-- END $$;
--
-- -- Step 6: Drop index from users
-- DROP INDEX IF EXISTS "users_stripe_customer_idx";
