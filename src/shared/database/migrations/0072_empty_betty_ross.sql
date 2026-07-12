CREATE TABLE "practice_export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"storage_key" text,
	"content_type" text,
	"byte_size" integer,
	"manifest" jsonb,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "practice_export_jobs" ADD CONSTRAINT "practice_export_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_export_jobs" ADD CONSTRAINT "practice_export_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_export_jobs_org_idempotency_idx" ON "practice_export_jobs" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "practice_export_jobs_org_created_idx" ON "practice_export_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "practice_export_jobs_status_idx" ON "practice_export_jobs" USING btree ("status","created_at");
