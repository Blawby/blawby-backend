-- Step 1: Drop existing indexes on subscription_id columns (they were built for text type)
DROP INDEX IF EXISTS "subscription_events_subscription_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "subscription_line_items_subscription_idx";--> statement-breakpoint

-- Step 2: Delete orphaned rows where subscription_id doesn't match any existing subscription
-- Step 2: Delete orphaned rows where subscription_id doesn't match any existing subscription OR has invalid UUID format
DELETE FROM "subscription_events"
WHERE "subscription_id" IS NOT NULL
  AND (
    "subscription_id" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR "subscription_id"::uuid NOT IN (SELECT "id" FROM "subscriptions")
  );--> statement-breakpoint

DELETE FROM "subscription_line_items"
WHERE "subscription_id" IS NOT NULL
  AND (
    "subscription_id" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR "subscription_id"::uuid NOT IN (SELECT "id" FROM "subscriptions")
  );--> statement-breakpoint

-- Step 3: Cast text columns to uuid using USING clause
ALTER TABLE "subscription_events" ALTER COLUMN "subscription_id" SET DATA TYPE uuid USING "subscription_id"::uuid;--> statement-breakpoint
ALTER TABLE "subscription_line_items" ALTER COLUMN "subscription_id" SET DATA TYPE uuid USING "subscription_id"::uuid;--> statement-breakpoint

-- Step 4: Add foreign key constraints
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_line_items" ADD CONSTRAINT "subscription_line_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Step 5: Recreate indexes for the new uuid type
CREATE INDEX "subscription_events_subscription_idx" ON "subscription_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_line_items_subscription_idx" ON "subscription_line_items" USING btree ("subscription_id");
