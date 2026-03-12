CREATE TABLE IF NOT EXISTS "matter_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"due_date" date,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"stage" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trust_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"matter_id" uuid,
	"transaction_type" varchar(50) NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"description" text,
	"source" varchar(100),
	"invoice_id" uuid,
	"stripe_payment_intent_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "trust_txn_type_check" CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer', 'refund'))
);
--> statement-breakpoint
DROP INDEX IF EXISTS "invoices_org_number_unique_idx";--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "invoice_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN IF NOT EXISTS "organization_id" uuid;--> statement-breakpoint
UPDATE "billing_transactions" bt SET "organization_id" = i."organization_id" FROM "invoices" i WHERE bt."invoice_id" = i."id" AND bt."organization_id" IS NULL;--> statement-breakpoint
UPDATE "billing_transactions" bt SET "organization_id" = m."organization_id" FROM "matters" m WHERE bt."matter_id" = m."id" AND bt."organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "billing_transactions" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "billing_transactions" ADD COLUMN IF NOT EXISTS "application_fee_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "application_fee_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "stripe_invoice_number" varchar(255);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "stripe_charge_id" varchar(255);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "stripe_transfer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "matter_expenses" ADD COLUMN IF NOT EXISTS "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "matter_expenses" ADD COLUMN IF NOT EXISTS "invoiced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matter_milestones" ADD COLUMN IF NOT EXISTS "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "matter_milestones" ADD COLUMN IF NOT EXISTS "invoiced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matter_time_entries" ADD COLUMN IF NOT EXISTS "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "matter_time_entries" ADD COLUMN IF NOT EXISTS "invoiced_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "matter_tasks" ADD CONSTRAINT "matter_tasks_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "matter_tasks" ADD CONSTRAINT "matter_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "trust_transactions" ADD CONSTRAINT "trust_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "trust_transactions" ADD CONSTRAINT "trust_transactions_client_id_user_details_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."user_details"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "trust_transactions" ADD CONSTRAINT "trust_transactions_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "trust_transactions" ADD CONSTRAINT "trust_transactions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "trust_transactions" ADD CONSTRAINT "trust_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_tasks_matter_idx" ON "matter_tasks" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_tasks_assignee_idx" ON "matter_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matter_tasks_due_date_idx" ON "matter_tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_transactions_client" ON "trust_transactions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_transactions_matter" ON "trust_transactions" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_transactions_invoice" ON "trust_transactions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_transactions_org" ON "trust_transactions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_transactions_org_client_created" ON "trust_transactions" USING btree ("organization_id","client_id","created_at");--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "matter_expenses" ADD CONSTRAINT "matter_expenses_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "matter_milestones" ADD CONSTRAINT "matter_milestones_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "matter_time_entries" ADD CONSTRAINT "matter_time_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_transactions_organization_idx" ON "billing_transactions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_org_number_unique_idx" ON "invoices" USING btree ("organization_id","invoice_number") WHERE "invoices"."invoice_number" IS NOT NULL AND "invoices"."deleted_at" IS NULL;