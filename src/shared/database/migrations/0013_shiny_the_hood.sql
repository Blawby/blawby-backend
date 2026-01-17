ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_event_id_unique";--> statement-breakpoint
-- Safe UUID conversion: create temporary column, backfill, then replace
ALTER TABLE "events" ADD COLUMN "event_id_tmp" uuid;--> statement-breakpoint
-- Populate temporary column: convert valid UUID strings (case-insensitive), generate new UUIDs for invalid values
UPDATE "events" SET "event_id_tmp" = CASE
  WHEN "event_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN "event_id"::uuid
  ELSE gen_random_uuid()
END;--> statement-breakpoint
-- Set NOT NULL and default on temporary column
ALTER TABLE "events" ALTER COLUMN "event_id_tmp" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "event_id_tmp" SET DEFAULT gen_random_uuid();--> statement-breakpoint
-- Drop old column and rename temporary column
ALTER TABLE "events" DROP COLUMN "event_id";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "event_id_tmp" TO "event_id";--> statement-breakpoint
-- Ensure primary key exists on the new event_id column
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
  -- Add primary key on the new event_id column
  ALTER TABLE "events" ADD PRIMARY KEY ("event_id");
END $$;--> statement-breakpoint
ALTER TABLE "stripe_connected_accounts" ADD COLUMN IF NOT EXISTS "future_requirements" json;--> statement-breakpoint
ALTER TABLE "stripe_connected_accounts" ADD COLUMN IF NOT EXISTS "tos_acceptance" json;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "id";
