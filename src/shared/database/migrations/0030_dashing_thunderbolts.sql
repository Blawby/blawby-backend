CREATE TABLE IF NOT EXISTS "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"matter_id" uuid,
	"connected_account_id" uuid NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"amount_due" integer DEFAULT 0 NOT NULL,
	"issue_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"stripe_invoice_id" varchar(255),
	"stripe_payment_intent_id" varchar(255),
	"stripe_hosted_invoice_url" text,
	"notes" text,
	"memo" text,
	"payment_from_retainer" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"line_total" integer DEFAULT 0 NOT NULL,
	"time_entry_id" uuid,
	"expense_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid,
	"matter_id" uuid,
	"stripe_transfer_id" text,
	"destination_account_id" text NOT NULL,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "billing_transactions_stripe_transfer_id_unique" UNIQUE("stripe_transfer_id")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid,
	"token" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"expires_at" timestamp with time zone,
	"accessed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"stripe_payment_link_id" varchar(255),
	"stripe_payment_intent_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_links_token_unique" UNIQUE("token")
);--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        CREATE TYPE "public"."invoice_type" AS ENUM('flat_fee', 'phase_fee', 'retainer_deposit');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "invoices" ADD COLUMN "invoice_type" "invoice_type" DEFAULT 'flat_fee' NOT NULL;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "invoices" ADD COLUMN "fund_destination" varchar(20) DEFAULT 'operating' NOT NULL;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "practice_client_intakes" ADD COLUMN "stripe_checkout_session_id" text;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "practice_client_intakes" ADD COLUMN "conversation_id" uuid;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        CREATE INDEX "invoices_type_idx" ON "invoices" USING btree ("invoice_type");
    EXCEPTION
        WHEN duplicate_table THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "practice_client_intakes" ADD CONSTRAINT "practice_client_intakes_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id");
    EXCEPTION
        WHEN duplicate_table OR duplicate_object THEN null;
    END;
END $$;--> statement-breakpoint

-- Foreign keys for invoices
DO $$ BEGIN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_user_details_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."user_details"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_connected_account_id_stripe_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."stripe_connected_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Foreign keys for invoice_line_items
DO $$ BEGIN
    ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_time_entry_id_matter_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."matter_time_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_expense_id_matter_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."matter_expenses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Foreign keys for billing_transactions
DO $$ BEGIN
    ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Foreign keys for payment_links
DO $$ BEGIN
    ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS "invoices_org_idx" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_client_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_matter_idx" ON "invoices" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_number_idx" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_stripe_id_idx" ON "invoices" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_org_number_unique_idx" ON "invoices" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_stripe_invoice_unique_idx" ON "invoices" USING btree ("stripe_invoice_id");--> statement-breakpoint

-- Indexes for invoice_line_items
CREATE INDEX IF NOT EXISTS "invoice_line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_time_entry_idx" ON "invoice_line_items" USING btree ("time_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_expense_idx" ON "invoice_line_items" USING btree ("expense_id");--> statement-breakpoint

-- Indexes for billing_transactions
CREATE INDEX IF NOT EXISTS "billing_transactions_invoice_idx" ON "billing_transactions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_transactions_matter_idx" ON "billing_transactions" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_transactions_stripe_transfer_idx" ON "billing_transactions" USING btree ("stripe_transfer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_transactions_status_idx" ON "billing_transactions" USING btree ("status");--> statement-breakpoint

-- Indexes for payment_links
CREATE INDEX IF NOT EXISTS "payment_links_org_idx" ON "payment_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_links_invoice_idx" ON "payment_links" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_links_token_idx" ON "payment_links" USING btree ("token");