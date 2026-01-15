CREATE TABLE "upload_audit_logs" (
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
CREATE TABLE "uploads" (
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
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_event_id_unique";--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_pkey";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "id";--> statement-breakpoint
-- Data migration: Ensure all event_id values are valid UUIDs
-- Generate new UUIDs for any non-UUID event_id values
UPDATE "events" SET "event_id" = gen_random_uuid()::text
WHERE "event_id" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "event_id" SET DATA TYPE uuid USING "event_id"::uuid;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "event_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "events" ADD PRIMARY KEY ("event_id");--> statement-breakpoint
-- Data migration: Convert string actor_ids to UUIDs before type change
-- NOTE: These UUID constants must match src/shared/events/constants.ts
-- If constants change, update this migration accordingly:
--   SYSTEM_ACTOR_UUID = '00000000-0000-0000-0000-000000000000'
--   WEBHOOK_ACTOR_UUID = '00000000-0000-0000-0000-000000000001'
--   CRON_ACTOR_UUID = '00000000-0000-0000-0000-000000000002'
--   API_ACTOR_UUID = '00000000-0000-0000-0000-000000000003'
--   ORGANIZATION_ACTOR_UUID = '00000000-0000-0000-0000-000000000004'
UPDATE "events" SET "actor_id" =
  CASE
    -- Already valid UUIDs
    WHEN "actor_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN "actor_id"
    -- Known string literals mapped to constant UUIDs (see constants.ts)
    WHEN "actor_id" = 'system' THEN '00000000-0000-0000-0000-000000000000'
    WHEN "actor_id" = 'webhook' THEN '00000000-0000-0000-0000-000000000001'
    WHEN "actor_id" = 'cron' THEN '00000000-0000-0000-0000-000000000002'
    WHEN "actor_id" = 'api' THEN '00000000-0000-0000-0000-000000000003'
    WHEN "actor_id" = 'organization' THEN '00000000-0000-0000-0000-000000000004'
    -- Default to system UUID for unknown values
    ELSE '00000000-0000-0000-0000-000000000000'
  END
WHERE "actor_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "actor_id" SET DATA TYPE uuid USING "actor_id"::uuid;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "actor_type" SET NOT NULL;--> statement-breakpoint
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
-- Create NOTIFY function for event bridge (future use)
CREATE OR REPLACE FUNCTION notify_new_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('new_event_channel', NEW.event_id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
-- Create trigger
DROP TRIGGER IF EXISTS trigger_notify_new_event ON "events";--> statement-breakpoint
CREATE TRIGGER trigger_notify_new_event
AFTER INSERT ON "events"
FOR EACH ROW
EXECUTE FUNCTION notify_new_event();
