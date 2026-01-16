CREATE TABLE IF NOT EXISTS "upload_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"organization_id" uuid,
	"action" varchar(50) NOT NULL,
	"user_id" uuid,
	"ip_address" varchar(45),
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"file_name" varchar(255) NOT NULL,
	"file_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_provider" varchar(20) NOT NULL,
	"storage_key" varchar(500),
	"public_url" varchar(1000),
	"upload_context" varchar(50) NOT NULL,
	"matter_id" uuid,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"status" varchar(20) DEFAULT 'pending',
	"is_privileged" boolean DEFAULT true,
	"retention_until" timestamp with time zone,
	"uploaded_by" uuid,
	"last_accessed_at" timestamp with time zone,
	"last_accessed_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"deletion_reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "practice_client_intakes" DROP CONSTRAINT IF EXISTS "practice_client_intakes_stripe_payment_intent_id_unique";--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ALTER COLUMN "stripe_payment_intent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "stripe_payment_link_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_audit_logs" ADD CONSTRAINT "upload_audit_logs_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_audit_logs" ADD CONSTRAINT "upload_audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_audit_logs" ADD CONSTRAINT "upload_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_last_accessed_by_users_id_fk" FOREIGN KEY ("last_accessed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_upload_idx" ON "upload_audit_logs" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "upload_audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "upload_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "upload_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "upload_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "uploads_org_matter_idx" ON "uploads" USING btree ("organization_id","matter_id");--> statement-breakpoint
CREATE INDEX "uploads_context_idx" ON "uploads" USING btree ("upload_context");--> statement-breakpoint
CREATE INDEX "uploads_retention_idx" ON "uploads" USING btree ("retention_until");--> statement-breakpoint
CREATE INDEX "uploads_status_idx" ON "uploads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "uploads_matter_id_idx" ON "uploads" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "uploads_created_at_idx" ON "uploads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "practice_client_intakes_stripe_link_idx" ON "practice_client_intakes" USING btree ("stripe_payment_link_id");--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD CONSTRAINT "practice_client_intakes_stripe_payment_link_id_unique" UNIQUE("stripe_payment_link_id");
