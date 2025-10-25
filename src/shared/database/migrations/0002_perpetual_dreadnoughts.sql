CREATE TABLE "jwkss" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_details" RENAME TO "user_details";--> statement-breakpoint
ALTER TABLE "user_details" DROP CONSTRAINT "customer_details_user_id_unique";--> statement-breakpoint
ALTER TABLE "user_details" DROP CONSTRAINT "customer_details_stripe_customer_id_unique";--> statement-breakpoint
ALTER TABLE "user_details" DROP CONSTRAINT "customer_details_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "customer_details_user_idx";--> statement-breakpoint
DROP INDEX "customer_details_stripe_customer_idx";--> statement-breakpoint
DROP INDEX "customer_details_created_at_idx";--> statement-breakpoint
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_details_user_idx" ON "user_details" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_details_stripe_customer_idx" ON "user_details" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "user_details_created_at_idx" ON "user_details" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_stripe_customer_id_unique" UNIQUE("stripe_customer_id");