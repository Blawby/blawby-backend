DO $$ BEGIN
    BEGIN
        CREATE TABLE "matter_status_history" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "matter_id" uuid NOT NULL,
            "from_status" varchar(40),
            "to_status" varchar(40) NOT NULL,
            "changed_by" uuid,
            "reason" text,
            "metadata" jsonb,
            "changed_at" timestamp with time zone DEFAULT now() NOT NULL
        );
    EXCEPTION
        WHEN duplicate_table THEN null;
    END;
END $$;--> statement-breakpoint

ALTER TABLE "matters" ALTER COLUMN "status" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "matters" ALTER COLUMN "status" SET DEFAULT 'first_contact';--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD COLUMN "case_number" varchar(100);
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD COLUMN "matter_type" varchar(100);
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD COLUMN "urgency" varchar(20);
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD COLUMN "responsible_attorney_id" uuid;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD COLUMN "originating_attorney_id" uuid;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD COLUMN "court" text;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD COLUMN "judge" text;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD COLUMN "opposing_party" text;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD COLUMN "opposing_counsel" text;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD COLUMN "open_date" timestamp with time zone;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD COLUMN "close_date" timestamp with time zone;
    EXCEPTION
        WHEN duplicate_column THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matter_status_history" ADD CONSTRAINT "matter_status_history_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
        WHEN duplicate_object THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matter_status_history" ADD CONSTRAINT "matter_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION
        WHEN duplicate_object THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        CREATE INDEX "matter_status_history_matter_idx" ON "matter_status_history" USING btree ("matter_id");
    EXCEPTION
        WHEN duplicate_table THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        CREATE INDEX "matter_status_history_changed_by_idx" ON "matter_status_history" USING btree ("changed_by");
    EXCEPTION
        WHEN duplicate_table THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        CREATE INDEX "matter_status_history_changed_at_idx" ON "matter_status_history" USING btree ("changed_at");
    EXCEPTION
        WHEN duplicate_table THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        CREATE INDEX "matter_status_history_to_status_idx" ON "matter_status_history" USING btree ("to_status");
    EXCEPTION
        WHEN duplicate_table THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD CONSTRAINT "matters_responsible_attorney_id_users_id_fk" FOREIGN KEY ("responsible_attorney_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION
        WHEN duplicate_object THEN null;
    END;
END $$;--> statement-breakpoint

DO $$ BEGIN
    BEGIN
        ALTER TABLE "matters" ADD CONSTRAINT "matters_originating_attorney_id_users_id_fk" FOREIGN KEY ("originating_attorney_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION
        WHEN duplicate_object THEN null;
    END;
END $$;