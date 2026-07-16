CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"channel" varchar(20) NOT NULL,
	"status" varchar(20) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"template_name" varchar(100),
	"title" varchar(200) NOT NULL,
	"body" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deduplication_key" varchar(200),
	"provider_message_id" varchar(255),
	"failure_code" varchar(100),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_channel_check" CHECK ("notifications"."channel" IN ('dashboard', 'email')),
	CONSTRAINT "notifications_status_check" CHECK ("notifications"."status" IN ('pending', 'sent', 'failed', 'skipped')),
	CONSTRAINT "notifications_email_template_check" CHECK ("notifications"."channel" <> 'email' OR "notifications"."template_name" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("organization_id","recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("organization_id","recipient_user_id","created_at") WHERE "notifications"."channel" = 'dashboard' AND "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notifications_delivery_status_idx" ON "notifications" USING btree ("organization_id","channel","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_deduplication_unique_idx" ON "notifications" USING btree ("organization_id","recipient_user_id","channel","deduplication_key") WHERE "notifications"."deduplication_key" IS NOT NULL;
