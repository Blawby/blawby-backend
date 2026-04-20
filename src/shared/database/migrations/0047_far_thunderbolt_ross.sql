CREATE TABLE "matter_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"linked_by" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uploads" RENAME COLUMN "upload_context" TO "scope_type";--> statement-breakpoint
ALTER TABLE "uploads" RENAME COLUMN "entity_id" TO "scope_id";--> statement-breakpoint
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_matter_id_matters_id_fk";
--> statement-breakpoint
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_uploaded_by_users_id_fk";
--> statement-breakpoint
DROP INDEX "uploads_org_matter_idx";--> statement-breakpoint
DROP INDEX "uploads_context_idx";--> statement-breakpoint
DROP INDEX "uploads_matter_id_idx";--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "storage_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "matter_files" ADD CONSTRAINT "matter_files_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_files" ADD CONSTRAINT "matter_files_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_files" ADD CONSTRAINT "matter_files_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "matter_files_matter_upload_unique" ON "matter_files" USING btree ("matter_id","upload_id");--> statement-breakpoint
CREATE INDEX "matter_files_matter_idx" ON "matter_files" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "matter_files_upload_idx" ON "matter_files" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "uploads_org_scope_idx" ON "uploads" USING btree ("organization_id","scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "uploads_scope_idx" ON "uploads" USING btree ("scope_type","scope_id");--> statement-breakpoint
ALTER TABLE "uploads" DROP COLUMN "matter_id";--> statement-breakpoint
ALTER TABLE "uploads" DROP COLUMN "entity_type";--> statement-breakpoint
ALTER TABLE "uploads" DROP COLUMN "uploaded_by";