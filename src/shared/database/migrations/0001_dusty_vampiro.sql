CREATE TABLE "customer_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"phone" text,
	"dob" timestamp,
	"product_usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_details_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "customer_details_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
ALTER TABLE "stripe_account_sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "stripe_account_sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "payment_links" RENAME TO "intake_payments";--> statement-breakpoint
ALTER TABLE "intake_payments" DROP CONSTRAINT "payment_links_ulid_unique";--> statement-breakpoint
ALTER TABLE "intake_payments" DROP CONSTRAINT "payment_links_stripe_payment_intent_id_unique";--> statement-breakpoint
ALTER TABLE "intake_payments" DROP CONSTRAINT "payment_links_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "intake_payments" DROP CONSTRAINT "payment_links_connected_account_id_stripe_connected_accounts_id_fk";
--> statement-breakpoint
DROP INDEX "payment_links_org_idx";--> statement-breakpoint
DROP INDEX "payment_links_org_status_idx";--> statement-breakpoint
DROP INDEX "payment_links_stripe_intent_idx";--> statement-breakpoint
DROP INDEX "payment_links_connected_account_idx";--> statement-breakpoint
DROP INDEX "payment_links_created_at_idx";--> statement-breakpoint
ALTER TABLE "intake_payments" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "intake_payments" ADD COLUMN "succeeded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_details" ADD CONSTRAINT "customer_details_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_details_user_idx" ON "customer_details" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_details_stripe_customer_idx" ON "customer_details" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "customer_details_created_at_idx" ON "customer_details" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "intake_payments" ADD CONSTRAINT "intake_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_payments" ADD CONSTRAINT "intake_payments_connected_account_id_stripe_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."stripe_connected_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intake_payments_org_idx" ON "intake_payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "intake_payments_stripe_intent_idx" ON "intake_payments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "intake_payments_ulid_idx" ON "intake_payments" USING btree ("ulid");--> statement-breakpoint
CREATE INDEX "intake_payments_status_idx" ON "intake_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "intake_payments_created_at_idx" ON "intake_payments" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "intake_payments" ADD CONSTRAINT "intake_payments_ulid_unique" UNIQUE("ulid");--> statement-breakpoint
ALTER TABLE "intake_payments" ADD CONSTRAINT "intake_payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id");