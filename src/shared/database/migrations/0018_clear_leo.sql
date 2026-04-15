CREATE TABLE IF NOT EXISTS "practice_client_memos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"content" text NOT NULL,
	"event_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"address_id" uuid,
	"stripe_customer_id" varchar(255),
	"status" varchar(20) DEFAULT 'lead' NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"event_name" varchar(255),
	"intake_id" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_clients_org_email_unique" UNIQUE("organization_id","email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matter_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matter_assignees" (
	"matter_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matter_assignees_matter_id_user_id_pk" PRIMARY KEY("matter_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matter_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount" integer NOT NULL,
	"date" date NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matter_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount" integer NOT NULL,
	"due_date" date NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matter_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matter_time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"duration" integer NOT NULL,
	"description" text,
	"billable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"practice_client_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text,
	"billing_type" varchar(20) NOT NULL,
	"total_fixed_price" integer,
	"contingency_percentage" real,
	"settlement_amount" integer,
	"practice_area_id" uuid,
	"admin_hourly_rate" integer,
	"attorney_hourly_rate" integer,
	"payment_frequency" varchar(20),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
    -- Drop old constraint if it exists
    ALTER TABLE "matters" DROP CONSTRAINT IF EXISTS "matters_customer_id_users_id_fk";
    
    -- Rename column if it exists and hasn't been renamed yet
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matters' AND column_name = 'customer_id') THEN
        ALTER TABLE "matters" RENAME COLUMN "customer_id" TO "practice_client_id";
    END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stripe_connected_accounts' AND column_name = 'company') THEN
        ALTER TABLE "stripe_connected_accounts" ALTER COLUMN "company" SET DATA TYPE jsonb;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stripe_connected_accounts' AND column_name = 'individual') THEN
        ALTER TABLE "stripe_connected_accounts" ALTER COLUMN "individual" SET DATA TYPE jsonb;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stripe_connected_accounts' AND column_name = 'requirements') THEN
        ALTER TABLE "stripe_connected_accounts" ALTER COLUMN "requirements" SET DATA TYPE jsonb;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stripe_connected_accounts' AND column_name = 'capabilities') THEN
        ALTER TABLE "stripe_connected_accounts" ALTER COLUMN "capabilities" SET DATA TYPE jsonb;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stripe_connected_accounts' AND column_name = 'external_accounts') THEN
        ALTER TABLE "stripe_connected_accounts" ALTER COLUMN "external_accounts" SET DATA TYPE jsonb;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stripe_connected_accounts' AND column_name = 'future_requirements') THEN
        ALTER TABLE "stripe_connected_accounts" ALTER COLUMN "future_requirements" SET DATA TYPE jsonb;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stripe_connected_accounts' AND column_name = 'tos_acceptance') THEN
        ALTER TABLE "stripe_connected_accounts" ALTER COLUMN "tos_acceptance" SET DATA TYPE jsonb;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stripe_connected_accounts' AND column_name = 'metadata') THEN
        ALTER TABLE "stripe_connected_accounts" ALTER COLUMN "metadata" SET DATA TYPE jsonb;
    END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'practice_client_memos_client_id_practice_clients_id_fk') THEN
        ALTER TABLE "practice_client_memos" ADD CONSTRAINT "practice_client_memos_client_id_practice_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."practice_clients"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'practice_client_memos_created_by_users_id_fk') THEN
        ALTER TABLE "practice_client_memos" ADD CONSTRAINT "practice_client_memos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'practice_clients_organization_id_organizations_id_fk') THEN
        ALTER TABLE "practice_clients" ADD CONSTRAINT "practice_clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'practice_clients_address_id_addresses_id_fk') THEN
        ALTER TABLE "practice_clients" ADD CONSTRAINT "practice_clients_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'practice_clients_intake_id_practice_client_intakes_id_fk') THEN
        ALTER TABLE "practice_clients" ADD CONSTRAINT "practice_clients_intake_id_practice_client_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."practice_client_intakes"("id") ON DELETE set null ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'practice_clients_deleted_by_users_id_fk') THEN
        ALTER TABLE "practice_clients" ADD CONSTRAINT "practice_clients_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matter_activity_log_matter_id_matters_id_fk') THEN
        ALTER TABLE "matter_activity_log" ADD CONSTRAINT "matter_activity_log_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matter_activity_log_user_id_users_id_fk') THEN
        ALTER TABLE "matter_activity_log" ADD CONSTRAINT "matter_activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matter_assignees_matter_id_matters_id_fk') THEN
        ALTER TABLE "matter_assignees" ADD CONSTRAINT "matter_assignees_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matter_assignees_user_id_users_id_fk') THEN
        ALTER TABLE "matter_assignees" ADD CONSTRAINT "matter_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matter_expenses_matter_id_matters_id_fk') THEN
        ALTER TABLE "matter_expenses" ADD CONSTRAINT "matter_expenses_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matter_expenses_user_id_users_id_fk') THEN
        ALTER TABLE "matter_expenses" ADD CONSTRAINT "matter_expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matter_milestones_matter_id_matters_id_fk') THEN
        ALTER TABLE "matter_milestones" ADD CONSTRAINT "matter_milestones_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matter_notes_matter_id_matters_id_fk') THEN
        ALTER TABLE "matter_notes" ADD CONSTRAINT "matter_notes_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matter_notes_user_id_users_id_fk') THEN
        ALTER TABLE "matter_notes" ADD CONSTRAINT "matter_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matter_time_entries_matter_id_matters_id_fk') THEN
        ALTER TABLE "matter_time_entries" ADD CONSTRAINT "matter_time_entries_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matter_time_entries_user_id_users_id_fk') THEN
        ALTER TABLE "matter_time_entries" ADD CONSTRAINT "matter_time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matters_organization_id_organizations_id_fk') THEN
        ALTER TABLE "matters" ADD CONSTRAINT "matters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matters_practice_client_id_practice_clients_id_fk') THEN
        ALTER TABLE "matters" ADD CONSTRAINT "matters_practice_client_id_practice_clients_id_fk" FOREIGN KEY ("practice_client_id") REFERENCES "public"."practice_clients"("id") ON DELETE set null ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matters_practice_area_id_practice_areas_id_fk') THEN
        ALTER TABLE "matters" ADD CONSTRAINT "matters_practice_area_id_practice_areas_id_fk" FOREIGN KEY ("practice_area_id") REFERENCES "public"."practice_areas"("id") ON DELETE set null ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matters_deleted_by_users_id_fk') THEN
        ALTER TABLE "matters" ADD CONSTRAINT "matters_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'practice_areas_organization_id_organizations_id_fk') THEN
        ALTER TABLE "practice_areas" ADD CONSTRAINT "practice_areas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_client_memos_client_idx" ON "practice_client_memos" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_client_memos_created_by_idx" ON "practice_client_memos" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_clients_org_idx" ON "practice_clients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_clients_email_idx" ON "practice_clients" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_clients_status_idx" ON "practice_clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_clients_stripe_id_idx" ON "practice_clients" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_clients_address_idx" ON "practice_clients" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_clients_deleted_at_idx" ON "practice_clients" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_clients_created_at_idx" ON "practice_clients" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_activity_log_matter_idx" ON "matter_activity_log" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_activity_log_user_idx" ON "matter_activity_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_activity_log_action_idx" ON "matter_activity_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_activity_log_created_at_idx" ON "matter_activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_assignees_matter_idx" ON "matter_assignees" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_assignees_user_idx" ON "matter_assignees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_expenses_matter_idx" ON "matter_expenses" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_expenses_user_idx" ON "matter_expenses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_expenses_date_idx" ON "matter_expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_expenses_billable_idx" ON "matter_expenses" USING btree ("billable");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_milestones_matter_idx" ON "matter_milestones" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_milestones_status_idx" ON "matter_milestones" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_milestones_due_date_idx" ON "matter_milestones" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_milestones_order_idx" ON "matter_milestones" USING btree ("order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_notes_matter_idx" ON "matter_notes" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_notes_user_idx" ON "matter_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_notes_created_at_idx" ON "matter_notes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_time_entries_matter_idx" ON "matter_time_entries" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_time_entries_user_idx" ON "matter_time_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_time_entries_start_time_idx" ON "matter_time_entries" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_time_entries_billable_idx" ON "matter_time_entries" USING btree ("billable");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matters_org_idx" ON "matters" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matters_client_idx" ON "matters" USING btree ("practice_client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matters_status_idx" ON "matters" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matters_practice_area_idx" ON "matters" USING btree ("practice_area_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matters_deleted_at_idx" ON "matters" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matters_created_at_idx" ON "matters" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_areas_org_idx" ON "practice_areas" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_areas_name_idx" ON "practice_areas" USING btree ("name");