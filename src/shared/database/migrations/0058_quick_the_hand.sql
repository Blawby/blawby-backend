CREATE TABLE "matter_deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"date" date NOT NULL,
	"type" varchar(20) NOT NULL,
	"source" text,
	"alert_days_before" integer[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matter_deadlines" ADD CONSTRAINT "matter_deadlines_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matter_deadlines_matter_idx" ON "matter_deadlines" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "matter_deadlines_date_idx" ON "matter_deadlines" USING btree ("date");--> statement-breakpoint
CREATE INDEX "matter_deadlines_type_idx" ON "matter_deadlines" USING btree ("type");