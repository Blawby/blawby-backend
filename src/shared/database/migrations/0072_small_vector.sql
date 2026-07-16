CREATE TABLE "pending_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"tool_name" varchar(100) NOT NULL,
	"tool_params" jsonb NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"executed_at" timestamp with time zone,
	"execution_result" jsonb,
	"execution_error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_actions_status_check" CHECK (status IN ('pending', 'rejected', 'executing', 'executed', 'failed', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "practice_details" ADD COLUMN "enabled_skills" jsonb DEFAULT '["matter_management","billing","client_intake"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pending_actions_org" ON "pending_actions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_pending_actions_status" ON "pending_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pending_actions_org_status" ON "pending_actions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pending_actions_active_idempotency" ON "pending_actions" USING btree ("organization_id","tool_name","idempotency_key") WHERE "pending_actions"."status" IN ('pending', 'executing');
