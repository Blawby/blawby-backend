CREATE TABLE "subscription_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid,
	"stripe_price_id" text NOT NULL,
	"stripe_product_id" text NOT NULL,
	"currency" text NOT NULL,
	"unit_amount" integer DEFAULT 0 NOT NULL,
	"interval" text,
	"interval_count" integer DEFAULT 1,
	"usage_type" text,
	"billing_scheme" text,
	"meter_id" text,
	"meter_name" text,
	"internal_type" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_prices_stripe_price_id_unique" UNIQUE("stripe_price_id")
);
--> statement-breakpoint
ALTER TABLE "subscription_events" DROP CONSTRAINT "subscription_events_plan_id_subscription_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_events" DROP CONSTRAINT "subscription_events_from_plan_id_subscription_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_events" DROP CONSTRAINT "subscription_events_to_plan_id_subscription_plans_id_fk";
--> statement-breakpoint
DROP INDEX "subscription_plans_stripe_monthly_price_idx";--> statement-breakpoint
DROP INDEX "subscription_plans_stripe_yearly_price_idx";--> statement-breakpoint
CREATE INDEX "subscription_prices_plan_idx" ON "subscription_prices" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscription_prices_stripe_price_idx" ON "subscription_prices" USING btree ("stripe_price_id");--> statement-breakpoint
CREATE INDEX "subscription_prices_product_idx" ON "subscription_prices" USING btree ("stripe_product_id");--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "stripe_monthly_price_id";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "stripe_yearly_price_id";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "monthly_price";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "yearly_price";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "metered_items";