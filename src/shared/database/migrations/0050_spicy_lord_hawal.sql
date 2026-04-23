CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "engagement_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"contract_body" text,
	"billing_snapshot" jsonb,
	"proposal_data" jsonb,
	"engagement_notes" text,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"signed_pdf_s3_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "last_conflict_check_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "last_conflict_check_result" jsonb;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "transcript_summary" text;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "jurisdiction_status" varchar(20);--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "jurisdiction_match" jsonb;--> statement-breakpoint
ALTER TABLE "engagement_contracts" ADD CONSTRAINT "engagement_contracts_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_contracts" ADD CONSTRAINT "engagement_contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_contracts" ADD CONSTRAINT "engagement_contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engagement_contracts_matter_idx" ON "engagement_contracts" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "engagement_contracts_org_idx" ON "engagement_contracts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "engagement_contracts_status_idx" ON "engagement_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "engagement_contracts_created_at_idx" ON "engagement_contracts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_contracts_matter_accepted_unique" ON "engagement_contracts" ("matter_id") WHERE "status" = 'accepted';--> statement-breakpoint
CREATE INDEX "practice_client_intakes_jurisdiction_status_idx" ON "practice_client_intakes" USING btree ("jurisdiction_status");
