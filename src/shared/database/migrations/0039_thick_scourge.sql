ALTER TABLE "matters" DROP CONSTRAINT "matters_deleted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "identity_upgrade_claims" ALTER COLUMN "anon_user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "identity_upgrade_claims" ALTER COLUMN "anon_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_upgrade_claims" ALTER COLUMN "registered_user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "identity_upgrade_claims" ALTER COLUMN "registered_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_upgrade_claims" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "email_logs" ADD COLUMN "expires_at" timestamp DEFAULT now() + interval '90 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_logs" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "email_logs" ADD COLUMN "is_anonymized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_upgrade_claims" ADD CONSTRAINT "identity_upgrade_claims_anon_user_id_users_id_fk" FOREIGN KEY ("anon_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_upgrade_claims" ADD CONSTRAINT "identity_upgrade_claims_registered_user_id_users_id_fk" FOREIGN KEY ("registered_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_logs_expires_at_anonymized_idx" ON "email_logs" USING btree ("expires_at","is_anonymized");--> statement-breakpoint
ALTER TABLE "identity_upgrade_claims" ADD CONSTRAINT "identity_upgrade_claims_anon_registered_unique" UNIQUE("anon_user_id","registered_user_id");