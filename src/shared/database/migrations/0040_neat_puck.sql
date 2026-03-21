CREATE TABLE "identity_upgrade_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anon_user_id" uuid,
	"registered_user_id" uuid,
	"claimed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matters" DROP CONSTRAINT "matters_deleted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "previous_anon_user_id" text;--> statement-breakpoint
ALTER TABLE "email_logs" ADD COLUMN "expires_at" timestamp DEFAULT now() + interval '90 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_logs" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "email_logs" ADD COLUMN "is_anonymized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_upgrade_claims" ADD CONSTRAINT "identity_upgrade_claims_anon_user_id_users_id_fk" FOREIGN KEY ("anon_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_upgrade_claims" ADD CONSTRAINT "identity_upgrade_claims_registered_user_id_users_id_fk" FOREIGN KEY ("registered_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_upgrade_claims_anon_user_idx" ON "identity_upgrade_claims" USING btree ("anon_user_id");--> statement-breakpoint
CREATE INDEX "identity_upgrade_claims_registered_user_idx" ON "identity_upgrade_claims" USING btree ("registered_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_upgrade_claims_anon_registered_unique" ON "identity_upgrade_claims" USING btree ("anon_user_id","registered_user_id") WHERE "identity_upgrade_claims"."anon_user_id" IS NOT NULL AND "identity_upgrade_claims"."registered_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_logs_expires_at_anonymized_idx" ON "email_logs" USING btree ("expires_at","is_anonymized");