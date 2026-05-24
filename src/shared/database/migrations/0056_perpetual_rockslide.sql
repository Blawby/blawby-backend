-- Step 1: Add denormalized product display columns to subscription_prices (all nullable)
ALTER TABLE "subscription_prices" ADD COLUMN IF NOT EXISTS "name" text;--> statement-breakpoint
ALTER TABLE "subscription_prices" ADD COLUMN IF NOT EXISTS "display_name" text;--> statement-breakpoint
ALTER TABLE "subscription_prices" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "subscription_prices" ADD COLUMN IF NOT EXISTS "features" jsonb;--> statement-breakpoint
ALTER TABLE "subscription_prices" ADD COLUMN IF NOT EXISTS "limits" jsonb;--> statement-breakpoint
ALTER TABLE "subscription_prices" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "subscription_prices" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "subscription_prices" ADD COLUMN IF NOT EXISTS "image" text;--> statement-breakpoint

-- Step 2: Backfill from subscription_plans while plan_id FK still exists
UPDATE "subscription_prices" sp
SET
  "name" = p."name",
  "display_name" = p."display_name",
  "description" = p."description",
  "features" = p."features",
  "limits" = p."limits",
  "is_public" = p."is_public",
  "sort_order" = p."sort_order",
  "image" = p."image"
FROM "subscription_plans" p
WHERE sp."plan_id" = p."id";--> statement-breakpoint

-- Step 3: Rename table
ALTER TABLE IF EXISTS "subscription_prices" RENAME TO "stripe_prices";--> statement-breakpoint

-- Step 4: Rename indexes to match new table name
ALTER INDEX IF EXISTS "subscription_prices_stripe_price_idx" RENAME TO "stripe_prices_stripe_price_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "subscription_prices_product_idx" RENAME TO "stripe_prices_product_idx";--> statement-breakpoint

-- Step 5: Drop plan_id index and column
DROP INDEX IF EXISTS "subscription_prices_plan_idx";--> statement-breakpoint
ALTER TABLE "stripe_prices" DROP COLUMN IF EXISTS "plan_id";--> statement-breakpoint

-- Step 6: Add new indexes for denormalized columns
CREATE INDEX IF NOT EXISTS "stripe_prices_name_idx" ON "stripe_prices" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_prices_active_sort_idx" ON "stripe_prices" USING btree ("is_active","sort_order");--> statement-breakpoint

-- Step 7: Drop subscription_plans (data already backfilled)
DROP TABLE IF EXISTS "subscription_plans";--> statement-breakpoint

-- Step 8: Add cancel_at to subscriptions
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at" timestamp;--> statement-breakpoint

-- Step 9: Make cancel_at_period_end NOT NULL (backfill NULLs first)
UPDATE "subscriptions" SET "cancel_at_period_end" = false WHERE "cancel_at_period_end" IS NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_at_period_end" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_at_period_end" SET NOT NULL;
