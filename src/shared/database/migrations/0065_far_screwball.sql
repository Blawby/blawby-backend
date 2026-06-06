CREATE TABLE "intake_template_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"field_type" text NOT NULL,
	"phase" text DEFAULT 'required' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"placeholder" text,
	"help_text" text,
	"prompt_hint" text,
	"is_standard" boolean DEFAULT false NOT NULL,
	"validation_rules" jsonb,
	"options" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"intro_message" text,
	"legal_disclaimer" text,
	"payment_link_enabled" boolean DEFAULT false NOT NULL,
	"consultation_fee" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intake_template_fields" ADD CONSTRAINT "intake_template_fields_template_id_intake_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."intake_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_templates" ADD CONSTRAINT "intake_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intake_template_fields_template_key_idx" ON "intake_template_fields" USING btree ("template_id","key");--> statement-breakpoint
CREATE INDEX "intake_template_fields_template_idx" ON "intake_template_fields" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "intake_template_fields_order_idx" ON "intake_template_fields" USING btree ("template_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_templates_org_slug_idx" ON "intake_templates" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "intake_templates_org_idx" ON "intake_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "intake_templates_status_idx" ON "intake_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "intake_templates_is_default_idx" ON "intake_templates" USING btree ("organization_id","is_default");