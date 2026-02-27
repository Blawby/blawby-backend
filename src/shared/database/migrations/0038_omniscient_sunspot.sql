CREATE TABLE "identity_upgrade_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anon_user_id" text NOT NULL,
	"registered_user_id" text NOT NULL,
	"claimed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "previous_anon_user_id" text;--> statement-breakpoint
CREATE INDEX "identity_upgrade_claims_anon_user_idx" ON "identity_upgrade_claims" USING btree ("anon_user_id");--> statement-breakpoint
CREATE INDEX "identity_upgrade_claims_registered_user_idx" ON "identity_upgrade_claims" USING btree ("registered_user_id");
