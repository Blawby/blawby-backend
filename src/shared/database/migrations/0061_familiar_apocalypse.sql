ALTER TABLE "payouts" ADD COLUMN "last_stripe_event_created_at" timestamp with time zone;--> statement-breakpoint
UPDATE "payouts" SET "last_stripe_event_created_at" = "stripe_created_at" WHERE "last_stripe_event_created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "last_stripe_event_created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "last_stripe_event_created_at" SET NOT NULL;
