CREATE TYPE "public"."invoice_type" AS ENUM('flat_fee', 'phase_fee', 'retainer_deposit');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "onboarding_complete" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "invoice_type" "invoice_type" DEFAULT 'flat_fee' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "fund_destination" varchar(20) DEFAULT 'operating' NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
CREATE INDEX "invoices_type_idx" ON "invoices" USING btree ("invoice_type");--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD CONSTRAINT "practice_client_intakes_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id");