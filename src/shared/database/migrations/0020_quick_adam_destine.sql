-- 1. Create the new practice_services table (since practice_areas was dropped in 0019)
CREATE TABLE IF NOT EXISTS "practice_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- 2. Create the unique index early (Required for Step 3's ON CONFLICT clause)
CREATE UNIQUE INDEX IF NOT EXISTS "practice_services_org_key_idx" ON "practice_services" USING btree ("organization_id","key");--> statement-breakpoint

-- 3. Data Migration: Extract services from practice_details JSONB and insert into practice_services
DO $$ 
DECLARE 
    practice_record RECORD;
    service_record JSONB;
    v_id uuid;
BEGIN
    -- Only proceed if practice_details still has the services column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'practice_details' AND column_name = 'services') THEN
        FOR practice_record IN SELECT organization_id, services FROM practice_details WHERE services IS NOT NULL LOOP
            FOR service_record IN SELECT jsonb_array_elements(practice_record.services) LOOP
                -- Safely handle UUID conversion
                BEGIN
                    IF (service_record->>'id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
                        v_id := (service_record->>'id')::uuid;
                    ELSE
                        v_id := gen_random_uuid();
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    v_id := gen_random_uuid();
                END;

                INSERT INTO "practice_services" ("id", "organization_id", "name", "key", "created_at", "updated_at")
                VALUES (
                    v_id,
                    practice_record.organization_id,
                    service_record->>'name',
                    UPPER(REPLACE(service_record->>'name', ' ', '_')), -- Generate a default key from the name
                    now(),
                    now()
                )
                ON CONFLICT (organization_id, key) DO NOTHING;
            END LOOP;
        END LOOP;
    END IF;
END $$;--> statement-breakpoint

-- 4. Rename columns in matters table safely
-- Handle customer_id -> practice_client_id (if not already renamed)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matters' AND column_name = 'customer_id') THEN
        ALTER TABLE "matters" RENAME COLUMN "customer_id" TO "practice_client_id";
    END IF;
END $$;--> statement-breakpoint

-- Handle service_id -> practice_service_id (0019 renamed practice_area_id to service_id)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matters' AND column_name = 'service_id') THEN
        ALTER TABLE "matters" RENAME COLUMN "service_id" TO "practice_service_id";
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matters' AND column_name = 'practice_area_id') THEN
        ALTER TABLE "matters" RENAME COLUMN "practice_area_id" TO "practice_service_id";
    END IF;
END $$;--> statement-breakpoint

-- 5. Data Cleanup: Set orphaned client and service references to NULL before adding constraints
UPDATE matters SET practice_client_id = NULL WHERE practice_client_id IS NOT NULL AND practice_client_id NOT IN (SELECT id FROM practice_clients);--> statement-breakpoint
UPDATE matters SET practice_service_id = NULL WHERE practice_service_id IS NOT NULL AND practice_service_id NOT IN (SELECT id FROM practice_services);--> statement-breakpoint

-- 6. Clean up old constraints/indexes and add new ones (using DO blocks for atomicity and existence checks)
DROP INDEX IF EXISTS "matters_customer_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "matters_practice_area_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "matters_service_idx";--> statement-breakpoint

DO $$ BEGIN
    -- practice_services organization_id FK
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_services_organization_id_organizations_id_fk') THEN
        ALTER TABLE "practice_services" ADD CONSTRAINT "practice_services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
    END IF;

    -- matters practice_client_id FK
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matters_practice_client_id_practice_clients_id_fk') THEN
        ALTER TABLE "matters" ADD CONSTRAINT "matters_practice_client_id_practice_clients_id_fk" FOREIGN KEY ("practice_client_id") REFERENCES "public"."practice_clients"("id") ON DELETE set null ON UPDATE no action;
    END IF;

    -- matters practice_service_id FK
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matters_practice_service_id_practice_services_id_fk') THEN
        ALTER TABLE "matters" ADD CONSTRAINT "matters_practice_service_id_practice_services_id_fk" FOREIGN KEY ("practice_service_id") REFERENCES "public"."practice_services"("id") ON DELETE set null ON UPDATE no action;
    END IF;
END $$;--> statement-breakpoint

-- 7. Indices (using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "matters_client_idx" ON "matters" USING btree ("practice_client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matters_practice_service_idx" ON "matters" USING btree ("practice_service_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_services_key_idx" ON "practice_services" USING btree ("key");--> statement-breakpoint

-- 8. Final cleanup of JSONB column
ALTER TABLE "practice_details" DROP COLUMN IF EXISTS "services";