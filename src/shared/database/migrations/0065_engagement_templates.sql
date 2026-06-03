CREATE TABLE "engagement_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"name" text NOT NULL,
	"practice_area" text DEFAULT '' NOT NULL,
	"fee_type" text DEFAULT 'hourly' NOT NULL,
	"hourly_rate_cents" integer,
	"flat_fee_cents" integer,
	"contingency_pct" numeric(5, 2),
	"retainer_cents" integer,
	"scope_template" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "engagement_templates" ADD CONSTRAINT "engagement_templates_practice_id_organizations_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "engagement_templates_practice_id_idx" ON "engagement_templates" USING btree ("practice_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "engagement_templates" ADD CONSTRAINT "engagement_templates_fee_type_check" CHECK (fee_type IN ('hourly', 'flat', 'contingency', 'pro_bono'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
