ALTER TABLE "intake_payments" RENAME TO "practice_customer_intakes";--> statement-breakpoint
ALTER TABLE "practice_customer_intakes" DROP CONSTRAINT "intake_payments_ulid_unique";--> statement-breakpoint
ALTER TABLE "practice_customer_intakes" DROP CONSTRAINT "intake_payments_stripe_payment_intent_id_unique";--> statement-breakpoint
ALTER TABLE "practice_customer_intakes" DROP CONSTRAINT "intake_payments_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "practice_customer_intakes" DROP CONSTRAINT "intake_payments_connected_account_id_stripe_connected_accounts_id_fk";
--> statement-breakpoint
DROP INDEX "intake_payments_org_idx";--> statement-breakpoint
DROP INDEX "intake_payments_stripe_intent_idx";--> statement-breakpoint
DROP INDEX "intake_payments_ulid_idx";--> statement-breakpoint
DROP INDEX "intake_payments_status_idx";--> statement-breakpoint
DROP INDEX "intake_payments_created_at_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_customer_intakes" ADD CONSTRAINT "practice_customer_intakes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_customer_intakes" ADD CONSTRAINT "practice_customer_intakes_connected_account_id_stripe_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."stripe_connected_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_customer_intakes_org_idx" ON "practice_customer_intakes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "practice_customer_intakes_stripe_intent_idx" ON "practice_customer_intakes" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "practice_customer_intakes_status_idx" ON "practice_customer_intakes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "practice_customer_intakes_created_at_idx" ON "practice_customer_intakes" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "practice_customer_intakes" DROP COLUMN "ulid";--> statement-breakpoint
ALTER TABLE "practice_customer_intakes" ADD CONSTRAINT "practice_customer_intakes_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id");