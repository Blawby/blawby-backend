-- Data migration: Convert string actor_ids to UUIDs before type change
-- NOTE: These UUID constants must match src/shared/events/constants.ts
-- If constants change, update this migration accordingly:
--   SYSTEM_ACTOR_UUID = '00000000-0000-0000-0000-000000000000'
--   WEBHOOK_ACTOR_UUID = '00000000-0000-0000-0000-000000000001'
--   CRON_ACTOR_UUID = '00000000-0000-0000-0000-000000000002'
--   API_ACTOR_UUID = '00000000-0000-0000-0000-000000000003'
--   ORGANIZATION_ACTOR_UUID = '00000000-0000-0000-0000-000000000004'
-- Only update if actor_id is still text (idempotent check)
DO $$
DECLARE
  unknown_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'actor_id'
      AND data_type = 'text'
  ) THEN
    -- Pre-migration validation: Check for unknown actor_id values
    SELECT COUNT(*) INTO unknown_count
    FROM "events"
    WHERE "actor_id" IS NOT NULL
      AND "actor_id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND "actor_id" NOT IN ('system', 'webhook', 'cron', 'api', 'organization');

    IF unknown_count > 0 THEN
      RAISE EXCEPTION 'Migration aborted: Found % rows with unknown actor_id values that are not valid UUIDs or known string literals. Please review and fix these values before running the migration.', unknown_count;
    END IF;

    -- Update actor_id: convert string literals to UUIDs (case-insensitive UUID matching)
    UPDATE "events" SET "actor_id" =
      CASE
        -- Already valid UUIDs (case-insensitive match)
        WHEN "actor_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN "actor_id"
        -- Known string literals mapped to constant UUIDs (see constants.ts)
        WHEN "actor_id" = 'system' THEN '00000000-0000-0000-0000-000000000000'
        WHEN "actor_id" = 'webhook' THEN '00000000-0000-0000-0000-000000000001'
        WHEN "actor_id" = 'cron' THEN '00000000-0000-0000-0000-000000000002'
        WHEN "actor_id" = 'api' THEN '00000000-0000-0000-0000-000000000003'
        WHEN "actor_id" = 'organization' THEN '00000000-0000-0000-0000-000000000004'
        -- This should never be reached due to pre-validation, but kept as safety net
        ELSE '00000000-0000-0000-0000-000000000000'
      END
    WHERE "actor_id" IS NOT NULL;

    -- Change type from text to uuid (only if still text)
    EXECUTE 'ALTER TABLE "events" ALTER COLUMN "actor_id" SET DATA TYPE uuid USING "actor_id"::uuid';
  END IF;
END $$;--> statement-breakpoint
-- Backfill NULL values before setting NOT NULL constraints
DO $$
BEGIN
  -- Backfill NULL actor_id values with system UUID
  UPDATE "events"
  SET "actor_id" = '00000000-0000-0000-0000-000000000000'
  WHERE "actor_id" IS NULL;

  -- Backfill NULL actor_type values with 'system' as fallback
  UPDATE "events"
  SET "actor_type" = 'system'
  WHERE "actor_type" IS NULL;
END $$;--> statement-breakpoint
-- Set NOT NULL constraints (idempotent - safe to run multiple times)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'actor_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "events" ALTER COLUMN "actor_id" SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'actor_type'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "events" ALTER COLUMN "actor_type" SET NOT NULL;
  END IF;
END $$;
