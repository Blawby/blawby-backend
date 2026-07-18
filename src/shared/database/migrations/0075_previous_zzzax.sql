ALTER TABLE "practice_client_intakes" ADD COLUMN "enrichment_status" varchar(20) DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "enrichment_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "enrichment_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "enrichment_claim_token" uuid;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "enrichment_model" varchar(200);--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "enrichment_error_code" varchar(100);--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "enrichment_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "enriched_at" timestamp with time zone;--> statement-breakpoint
-- practice_client_intakes_enrichment_status_idx is created out-of-band via
-- `CREATE INDEX CONCURRENTLY IF NOT EXISTS "practice_client_intakes_enrichment_status_idx"
-- ON "practice_client_intakes" USING btree ("organization_id","enrichment_status");`
-- CONCURRENTLY cannot run inside drizzle-kit's transactional migration, so it must be
-- applied manually against production before/after this migration to avoid a blocking
-- table lock on a live table.
ALTER TABLE "practice_client_intakes" ADD CONSTRAINT "practice_client_intakes_enrichment_status_check" CHECK ("practice_client_intakes"."enrichment_status" IN ('not_requested', 'pending', 'processing', 'succeeded', 'failed')) NOT VALID;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" VALIDATE CONSTRAINT "practice_client_intakes_enrichment_status_check";