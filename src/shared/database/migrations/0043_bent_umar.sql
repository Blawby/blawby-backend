-- Create refund_requests table if it doesn't already exist
CREATE TABLE IF NOT EXISTS "refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"client_user_details_id" uuid NOT NULL,
	"created_by_user_details_id" uuid NOT NULL,
	"requested_amount" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'usd' NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"status" varchar(50) DEFAULT 'requested' NOT NULL,
	"stripe_refund_id" varchar(255),
	"stripe_payment_intent_id" varchar(255),
	"executed_amount" integer,
	"executed_at" timestamp with time zone,
	"executed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_status_check" CHECK (status IN ('requested', 'approved', 'rejected', 'executed', 'failed', 'cancelled', 'executing')),
	CONSTRAINT "refund_requested_amount_check" CHECK (requested_amount > 0),
	CONSTRAINT "refund_executed_amount_check" CHECK (executed_amount IS NULL OR executed_amount >= 0)
);
--> statement-breakpoint
-- Rename column only if it exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billing_transactions' AND column_name='application_fee_amount') THEN
    ALTER TABLE "billing_transactions" RENAME COLUMN "application_fee_amount" TO "metered_fee_cents";
  END IF;
END $$;
--> statement-breakpoint
-- Add foreign key constraints if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='refund_requests_organization_id_organizations_id_fk') THEN
    ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='refund_requests_invoice_id_invoices_id_fk') THEN
    ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='refund_requests_client_user_details_id_clients_id_fk') THEN
    ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_client_user_details_id_clients_id_fk" FOREIGN KEY ("client_user_details_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='refund_requests_created_by_user_details_id_clients_id_fk') THEN
    ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_created_by_user_details_id_clients_id_fk" FOREIGN KEY ("created_by_user_details_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='refund_requests_executed_by_user_id_users_id_fk') THEN
    ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_executed_by_user_id_users_id_fk" FOREIGN KEY ("executed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='refund_requests_reviewed_by_user_id_users_id_fk') THEN
    ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "idx_refund_requests_org" ON "refund_requests" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refund_requests_invoice" ON "refund_requests" USING btree ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refund_requests_client" ON "refund_requests" USING btree ("client_user_details_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refund_requests_status" ON "refund_requests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refund_requests_org_status" ON "refund_requests" USING btree ("organization_id","status");
--> statement-breakpoint
-- Drop column only if it exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='application_fee_amount') THEN
    ALTER TABLE "invoices" DROP COLUMN "application_fee_amount";
  END IF;
END $$;