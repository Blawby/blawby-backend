ALTER TABLE "user_details" RENAME TO "clients";--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "user_details_org_user_unique";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_client_id_user_details_id_fk";
--> statement-breakpoint
ALTER TABLE "matters" DROP CONSTRAINT "matters_client_id_user_details_id_fk";
--> statement-breakpoint
ALTER TABLE "trust_transactions" DROP CONSTRAINT "trust_transactions_client_id_user_details_id_fk";
--> statement-breakpoint
ALTER TABLE "practice_client_memos" DROP CONSTRAINT "practice_client_memos_client_id_user_details_id_fk";
--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "user_details_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "user_details_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "user_details_address_id_addresses_id_fk";
--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "user_details_intake_id_practice_client_intakes_id_fk";
--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "user_details_deleted_by_users_id_fk";
--> statement-breakpoint
DROP INDEX "user_details_org_idx";--> statement-breakpoint
DROP INDEX "user_details_user_idx";--> statement-breakpoint
DROP INDEX "user_details_status_idx";--> statement-breakpoint
DROP INDEX "user_details_stripe_id_idx";--> statement-breakpoint
DROP INDEX "user_details_address_idx";--> statement-breakpoint
DROP INDEX "user_details_deleted_at_idx";--> statement-breakpoint
DROP INDEX "user_details_created_at_idx";--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_transactions" ADD CONSTRAINT "trust_transactions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_client_memos" ADD CONSTRAINT "practice_client_memos_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_intake_id_practice_client_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."practice_client_intakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_org_idx" ON "clients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "clients_user_idx" ON "clients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clients_stripe_id_idx" ON "clients" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "clients_address_idx" ON "clients" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX "clients_deleted_at_idx" ON "clients" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "clients_created_at_idx" ON "clients" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_org_user_unique" UNIQUE("organization_id","user_id");

ALTER TABLE "clients" DROP CONSTRAINT "clients_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "name" varchar(255);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email" varchar(255);--> statement-breakpoint
UPDATE "clients" AS c
SET
  "name" = COALESCE(c."name", u."name"),
  "email" = COALESCE(c."email", u."email")
FROM "users" AS u
WHERE c."user_id" = u."id"
  AND (c."name" IS NULL OR c."email" IS NULL);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
