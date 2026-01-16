ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_event_id_unique";--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_pkey'
    AND conrelid = 'events'::regclass
  ) THEN
    ALTER TABLE "events" ADD PRIMARY KEY ("event_id");
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "event_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "event_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "stripe_connected_accounts" ADD COLUMN IF NOT EXISTS "future_requirements" json;--> statement-breakpoint
ALTER TABLE "stripe_connected_accounts" ADD COLUMN IF NOT EXISTS "tos_acceptance" json;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "id";
