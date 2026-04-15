CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"seats" integer,
	"trial_start" timestamp,
	"trial_end" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" text NOT NULL,
	"plan_id" uuid,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"from_plan_id" uuid,
	"to_plan_id" uuid,
	"triggered_by" text,
	"triggered_by_type" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" text NOT NULL,
	"stripe_subscription_item_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"item_type" text NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount" numeric(10, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_line_items_stripe_subscription_item_id_unique" UNIQUE("stripe_subscription_item_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"stripe_product_id" text NOT NULL,
	"stripe_monthly_price_id" text,
	"stripe_yearly_price_id" text,
	"monthly_price" numeric(10, 2),
	"yearly_price" numeric(10, 2),
	"currency" text DEFAULT 'usd' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '{"users":-1,"invoices_per_month":-1,"storage_gb":10}'::jsonb NOT NULL,
	"metered_items" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name"),
	CONSTRAINT "subscription_plans_stripe_product_id_unique" UNIQUE("stripe_product_id")
);
--> statement-breakpoint
ALTER TABLE "practice_details" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_from_plan_id_subscription_plans_id_fk" FOREIGN KEY ("from_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_to_plan_id_subscription_plans_id_fk" FOREIGN KEY ("to_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_events_subscription_idx" ON "subscription_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_events_type_idx" ON "subscription_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "subscription_events_created_at_idx" ON "subscription_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscription_events_plan_idx" ON "subscription_events" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscription_line_items_subscription_idx" ON "subscription_line_items" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_line_items_stripe_item_idx" ON "subscription_line_items" USING btree ("stripe_subscription_item_id");--> statement-breakpoint
CREATE INDEX "subscription_plans_name_idx" ON "subscription_plans" USING btree ("name");--> statement-breakpoint
CREATE INDEX "subscription_plans_active_sort_idx" ON "subscription_plans" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "subscription_plans_stripe_product_idx" ON "subscription_plans" USING btree ("stripe_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_stripe_monthly_price_idx" ON "subscription_plans" USING btree ("stripe_monthly_price_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_stripe_yearly_price_idx" ON "subscription_plans" USING btree ("stripe_yearly_price_id");