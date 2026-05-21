ALTER TABLE "matter_files" DROP CONSTRAINT "matter_files_linked_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "matter_files" ALTER COLUMN "linked_by" DROP NOT NULL;--> statement-breakpoint
UPDATE "uploads" SET "is_privileged" = true WHERE "is_privileged" IS NULL;--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "is_privileged" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "matter_files" ADD CONSTRAINT "matter_files_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uploads_org_scope_active_idx" ON "uploads" USING btree ("organization_id","scope_type","scope_id") WHERE "uploads"."deleted_at" IS NULL;
