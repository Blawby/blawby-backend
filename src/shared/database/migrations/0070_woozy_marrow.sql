CREATE TABLE "intake_conversation_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"role" varchar NOT NULL,
	"content" text NOT NULL,
	"reply_to_message_id" uuid,
	"metadata" jsonb,
	"seq" integer NOT NULL,
	"client_id" text NOT NULL,
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_conversation_messages_conv_seq_uniq" UNIQUE("conversation_id","seq"),
	CONSTRAINT "intake_conversation_messages_conv_client_id_uniq" UNIQUE("conversation_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "intake_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"matter_id" uuid,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"lifecycle_status" varchar DEFAULT 'pending_visibility' NOT NULL,
	"assigned_to_user_id" uuid,
	"priority" varchar DEFAULT 'normal' NOT NULL,
	"tags" text[],
	"internal_notes" text,
	"last_message_at" timestamp with time zone,
	"last_message_content" text,
	"latest_seq" integer DEFAULT 0 NOT NULL,
	"intake_mode_activated_at" timestamp with time zone,
	"ai_failed_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intake_conversation_messages" ADD CONSTRAINT "intake_conversation_messages_conversation_id_intake_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."intake_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_conversation_messages" ADD CONSTRAINT "intake_conversation_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_conversation_messages" ADD CONSTRAINT "intake_conversation_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_conversations" ADD CONSTRAINT "intake_conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_conversations" ADD CONSTRAINT "intake_conversations_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_conversations" ADD CONSTRAINT "intake_conversations_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intake_conversation_messages_conv_seq_idx" ON "intake_conversation_messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "intake_conversation_messages_org_idx" ON "intake_conversation_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "intake_conversations_org_lifecycle_last_message_idx" ON "intake_conversations" USING btree ("organization_id","lifecycle_status","last_message_at");--> statement-breakpoint
CREATE INDEX "intake_conversations_org_status_idx" ON "intake_conversations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "intake_conversations_matter_idx" ON "intake_conversations" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "intake_conversations_client_user_idx" ON "intake_conversations" USING btree ("client_user_id");--> statement-breakpoint
CREATE INDEX "intake_conversations_assigned_status_idx" ON "intake_conversations" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD CONSTRAINT "practice_client_intakes_conversation_id_intake_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."intake_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_details" DROP COLUMN "service_states";
