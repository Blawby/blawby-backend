-- Rename table from practice_clients to user_details
ALTER TABLE "practice_clients" RENAME TO "user_details";--> statement-breakpoint
ALTER TABLE "matters" RENAME COLUMN "practice_client_id" TO "client_id";--> statement-breakpoint

-- Drop old constraints
ALTER TABLE "user_details" DROP CONSTRAINT "practice_clients_org_email_unique";--> statement-breakpoint
ALTER TABLE "practice_client_memos" DROP CONSTRAINT "practice_client_memos_client_id_practice_clients_id_fk";--> statement-breakpoint
ALTER TABLE "user_details" DROP CONSTRAINT "practice_clients_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "user_details" DROP CONSTRAINT "practice_clients_address_id_addresses_id_fk";--> statement-breakpoint
ALTER TABLE "user_details" DROP CONSTRAINT "practice_clients_intake_id_practice_client_intakes_id_fk";--> statement-breakpoint
ALTER TABLE "user_details" DROP CONSTRAINT "practice_clients_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "matters" DROP CONSTRAINT "matters_practice_client_id_practice_clients_id_fk";--> statement-breakpoint

-- Drop old indexes
DROP INDEX "practice_clients_org_idx";--> statement-breakpoint
DROP INDEX "practice_clients_email_idx";--> statement-breakpoint
DROP INDEX "practice_clients_status_idx";--> statement-breakpoint
DROP INDEX "practice_clients_stripe_id_idx";--> statement-breakpoint
DROP INDEX "practice_clients_address_idx";--> statement-breakpoint
DROP INDEX "practice_clients_deleted_at_idx";--> statement-breakpoint
DROP INDEX "practice_clients_created_at_idx";--> statement-breakpoint
DROP INDEX "matters_client_idx";--> statement-breakpoint

-- Add Better Auth admin plugin columns
ALTER TABLE "sessions" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned" boolean;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ban_expires" timestamp;--> statement-breakpoint

-- Add user_id column (initially nullable for data migration)
ALTER TABLE "user_details" ADD COLUMN "user_id" uuid;--> statement-breakpoint

-- Data migration: create users for existing records that don't have a matching user
INSERT INTO users (id, name, email, phone, email_verified, is_anonymous, primary_workspace, created_at, updated_at)
SELECT gen_random_uuid(), ud.name, LOWER(ud.email), ud.phone, false, true, 'client', ud.created_at, now()
FROM user_details ud
WHERE ud.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(ud.email))
ON CONFLICT (email) DO NOTHING;--> statement-breakpoint

-- Link user_details to users by email
UPDATE user_details ud
SET user_id = u.id
FROM users u
WHERE LOWER(ud.email) = LOWER(u.email)
  AND ud.user_id IS NULL;--> statement-breakpoint

-- Make user_id NOT NULL after data migration
ALTER TABLE "user_details" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint

-- Add FK constraint for user_id
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Now safe to drop the duplicated columns
ALTER TABLE "user_details" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "user_details" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "user_details" DROP COLUMN "phone";--> statement-breakpoint

-- Re-add other FK constraints with new table name
ALTER TABLE "practice_client_memos" ADD CONSTRAINT "practice_client_memos_client_id_user_details_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."user_details"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_intake_id_practice_client_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."practice_client_intakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_client_id_user_details_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."user_details"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Create new indexes
CREATE INDEX "user_details_org_idx" ON "user_details" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_details_user_idx" ON "user_details" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_details_status_idx" ON "user_details" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_details_stripe_id_idx" ON "user_details" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "user_details_address_idx" ON "user_details" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX "user_details_deleted_at_idx" ON "user_details" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "user_details_created_at_idx" ON "user_details" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "matters_client_idx" ON "matters" USING btree ("client_id");--> statement-breakpoint

-- Add unique constraint
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_org_user_unique" UNIQUE("organization_id","user_id");
