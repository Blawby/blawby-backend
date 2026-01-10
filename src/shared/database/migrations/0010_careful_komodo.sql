CREATE TABLE IF NOT EXISTS "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"type" text DEFAULT 'practice_location' NOT NULL,
	"line1" text,
	"line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "owner_check" CHECK (("addresses"."organization_id" IS NOT NULL) OR ("addresses"."user_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "actor_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "practice_details" ADD COLUMN IF NOT EXISTS "address_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_details" ADD COLUMN IF NOT EXISTS "website" text;--> statement-breakpoint
ALTER TABLE "practice_details" ADD COLUMN IF NOT EXISTS "intro_message" text;--> statement-breakpoint
ALTER TABLE "practice_details" ADD COLUMN IF NOT EXISTS "overview" text;--> statement-breakpoint
ALTER TABLE "practice_details" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_details" ADD COLUMN IF NOT EXISTS "services" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "addresses" ADD CONSTRAINT "addresses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "practice_details" ADD CONSTRAINT "practice_details_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;