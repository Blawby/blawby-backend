DROP INDEX "intake_templates_is_default_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "intake_templates_one_default_idx" ON "intake_templates" USING btree ("organization_id") WHERE "intake_templates"."is_default" = true;--> statement-breakpoint
ALTER TABLE "intake_templates" ADD CONSTRAINT "intake_templates_status_check" CHECK (status IN ('draft', 'published', 'archived'));--> statement-breakpoint
ALTER TABLE "intake_template_fields" ADD CONSTRAINT "intake_template_fields_phase_check" CHECK (phase IN ('required', 'enrichment'));--> statement-breakpoint
ALTER TABLE "intake_template_fields" ADD CONSTRAINT "intake_template_fields_field_type_check" CHECK (field_type IN ('text', 'textarea', 'email', 'phone', 'select', 'multiselect', 'date', 'boolean', 'number'));