CREATE TABLE "intake_template_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"base_revision" integer NOT NULL,
	"instruction" text NOT NULL,
	"proposed_edits" jsonb NOT NULL,
	"analytics_evidence" jsonb NOT NULL,
	"status" text DEFAULT 'staged' NOT NULL,
	"created_by" uuid NOT NULL,
	"decided_by" uuid,
	"applied_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "intake_templates" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "intake_templates" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
UPDATE "intake_templates" SET "published_at" = "updated_at" WHERE "status" = 'published';--> statement-breakpoint
ALTER TABLE "intake_template_suggestions" ADD CONSTRAINT "intake_template_suggestions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_template_suggestions" ADD CONSTRAINT "intake_template_suggestions_template_id_intake_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."intake_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_template_suggestions" ADD CONSTRAINT "intake_template_suggestions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_template_suggestions" ADD CONSTRAINT "intake_template_suggestions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intake_template_suggestions_org_request_idx" ON "intake_template_suggestions" USING btree ("organization_id","request_key");--> statement-breakpoint
CREATE INDEX "intake_template_suggestions_template_idx" ON "intake_template_suggestions" USING btree ("template_id","created_at");--> statement-breakpoint
CREATE INDEX "intake_template_suggestions_status_idx" ON "intake_template_suggestions" USING btree ("organization_id","status");