CREATE TABLE "client_intake_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"date_of_birth" date,
	"preferred_contact_method" varchar(10),
	"referral_source" varchar(255),
	"intake_date" date,
	"eligibility_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"amount_off" integer,
	"percent_off" numeric(5, 2),
	"currency" varchar(3),
	"discount_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_intake_profiles_client_unique" UNIQUE("client_id"),
	CONSTRAINT "client_intake_profiles_discount_check" CHECK ((
        ("client_intake_profiles"."amount_off" IS NULL AND "client_intake_profiles"."percent_off" IS NULL AND "client_intake_profiles"."currency" IS NULL)
        OR ("client_intake_profiles"."amount_off" > 0 AND "client_intake_profiles"."currency" IS NOT NULL AND "client_intake_profiles"."percent_off" IS NULL)
        OR ("client_intake_profiles"."percent_off" > 0 AND "client_intake_profiles"."percent_off" <= 100 AND "client_intake_profiles"."amount_off" IS NULL AND "client_intake_profiles"."currency" IS NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "client_intake_profiles" ADD CONSTRAINT "client_intake_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;