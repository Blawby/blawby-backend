ALTER TABLE "payouts" ALTER COLUMN "amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "last_stripe_event_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "payouts_org_created_at_id_idx" ON "payouts" USING btree ("organization_id","stripe_created_at","id");