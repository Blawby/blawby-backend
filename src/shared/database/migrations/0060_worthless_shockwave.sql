ALTER TABLE "matters" ADD COLUMN "retainer_cap" integer;--> statement-breakpoint
CREATE INDEX "matter_activity_log_matter_created_at_idx" ON "matter_activity_log" USING btree ("matter_id","created_at");--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_retainer_cap_non_negative" CHECK ("matters"."retainer_cap" >= 0);