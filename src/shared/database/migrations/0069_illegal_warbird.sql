CREATE TABLE "practice_member_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"practice_areas" text[] DEFAULT '{}'::text[] NOT NULL,
	"service_counties" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_capacity" integer,
	"accepting_clients" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_member_profiles_member_unique" UNIQUE("member_id"),
	CONSTRAINT "practice_member_profiles_max_capacity_non_negative" CHECK ("practice_member_profiles"."max_capacity" IS NULL OR "practice_member_profiles"."max_capacity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "client_intake_profiles" DROP CONSTRAINT "client_intake_profiles_discount_check";--> statement-breakpoint
ALTER TABLE "practice_member_profiles" ADD CONSTRAINT "practice_member_profiles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_intake_profiles" ADD CONSTRAINT "client_intake_profiles_discount_check" CHECK ((("client_intake_profiles"."amount_off" is null and "client_intake_profiles"."percent_off" is null and "client_intake_profiles"."currency" is null) or ("client_intake_profiles"."amount_off" > 0 and "client_intake_profiles"."currency" is not null and "client_intake_profiles"."percent_off" is null) or ("client_intake_profiles"."percent_off" > 0 and "client_intake_profiles"."percent_off" <= 100 and "client_intake_profiles"."amount_off" is null and "client_intake_profiles"."currency" is null)));
