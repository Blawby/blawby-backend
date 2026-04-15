ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_event_id_unique";--> statement-breakpoint
-- Safe UUID conversion: only run if event_id is still text (idempotent check)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'event_id'
      AND data_type = 'text'
  ) THEN
    -- Create temporary column, backfill, then replace
    ALTER TABLE "events" ADD COLUMN "event_id_tmp" uuid;

    -- Populate temporary column: convert valid UUID strings (case-insensitive), generate new UUIDs for invalid values
    UPDATE "events" SET "event_id_tmp" = CASE
      WHEN "event_id"::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN "event_id"::uuid
      ELSE gen_random_uuid()
    END;

    -- Set NOT NULL and default on temporary column
    ALTER TABLE "events" ALTER COLUMN "event_id_tmp" SET NOT NULL;
    ALTER TABLE "events" ALTER COLUMN "event_id_tmp" SET DEFAULT gen_random_uuid();

    -- Drop old column and rename temporary column
    ALTER TABLE "events" DROP COLUMN "event_id";
    ALTER TABLE "events" RENAME COLUMN "event_id_tmp" TO "event_id";
  END IF;
END $$;--> statement-breakpoint
-- Ensure primary key exists on the event_id column (idempotent)
DO $$
BEGIN
  -- Drop existing PK if it exists (shouldn't, but safe)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_pkey'
    AND conrelid = 'events'::regclass
  ) THEN
    ALTER TABLE "events" DROP CONSTRAINT "events_pkey";
  END IF;
  -- Add primary key on the event_id column (only if it doesn't exist)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_pkey'
    AND conrelid = 'events'::regclass
  ) THEN
    ALTER TABLE "events" ADD PRIMARY KEY ("event_id");
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "stripe_connected_accounts" ADD COLUMN IF NOT EXISTS "future_requirements" json;--> statement-breakpoint
ALTER TABLE "stripe_connected_accounts" ADD COLUMN IF NOT EXISTS "tos_acceptance" json;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "id";
