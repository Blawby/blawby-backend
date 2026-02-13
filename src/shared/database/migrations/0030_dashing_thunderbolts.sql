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
END $$;