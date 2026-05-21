ALTER TABLE "preferences" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "organization" jsonb;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preferences_organization_idx" ON "preferences" USING btree ("organization_id");