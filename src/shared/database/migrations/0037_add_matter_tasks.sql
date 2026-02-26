CREATE TABLE "matter_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"due_date" date,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"stage" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matter_tasks" ADD CONSTRAINT "matter_tasks_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_tasks" ADD CONSTRAINT "matter_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matter_tasks_matter_idx" ON "matter_tasks" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "matter_tasks_assignee_idx" ON "matter_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "matter_tasks_due_date_idx" ON "matter_tasks" USING btree ("due_date");
