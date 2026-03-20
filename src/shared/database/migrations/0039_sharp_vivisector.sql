DROP INDEX IF EXISTS "matters_retainer_threshold_idx";--> statement-breakpoint
CREATE INDEX "matters_retainer_threshold_idx" ON "matters" USING btree ("retainer_low_balance_threshold") WHERE "matters"."retainer_low_balance_threshold" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_retainer_threshold_non_negative" CHECK ("retainer_low_balance_threshold" >= 0) NOT VALID;
