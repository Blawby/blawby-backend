ALTER TABLE "app_configs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "app_configs" CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "reference_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN "application_fee_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "application_fee_amount" integer DEFAULT 0 NOT NULL;