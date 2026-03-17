ALTER TABLE "billing_transactions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "retainer_low_balance_threshold" integer;--> statement-breakpoint
CREATE INDEX "matters_retainer_threshold_idx" ON "matters" USING btree ("retainer_low_balance_threshold");