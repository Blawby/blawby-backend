DROP INDEX "stripe_prices_stripe_price_idx";--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_at_period_end" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "date_of_birth" date;