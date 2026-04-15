-- ============================================================================
-- Migration: Convert Better Auth tables from text to uuid
-- ============================================================================
-- IMPORTANT: Run scripts/migrate-nanoid-to-uuid.ts BEFORE this migration
-- to convert any existing nanoid strings to valid UUIDs.
--
-- Usage:
--   1. npx tsx scripts/migrate-nanoid-to-uuid.ts --dry-run  (preview changes)
--   2. npx tsx scripts/migrate-nanoid-to-uuid.ts            (apply data migration)
--   3. pnpm drizzle-kit migrate                             (apply schema migration)
-- ============================================================================

-- Pre-check: Verify all IDs are valid UUIDs before attempting conversion
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  -- Check users table
  SELECT COUNT(*) INTO invalid_count FROM users
  WHERE id IS NOT NULL AND id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Found % invalid UUIDs in users.id. Run scripts/migrate-nanoid-to-uuid.ts first.', invalid_count;
  END IF;

  -- Check organizations table
  SELECT COUNT(*) INTO invalid_count FROM organizations
  WHERE id IS NOT NULL AND id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Found % invalid UUIDs in organizations.id. Run scripts/migrate-nanoid-to-uuid.ts first.', invalid_count;
  END IF;
END $$;

--> statement-breakpoint

-- ============================================================================
-- STEP 1: Drop all foreign key constraints
-- ============================================================================

-- accounts
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_user_id_users_id_fk";

-- sessions
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_user_id_users_id_fk";

-- members
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_organization_id_organizations_id_fk";
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_user_id_users_id_fk";

-- invitations
ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "invitations_organization_id_organizations_id_fk";
ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "invitations_inviter_id_users_id_fk";

-- practice_details (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'practice_details') THEN
    ALTER TABLE "practice_details" DROP CONSTRAINT IF EXISTS "practice_details_organization_id_organizations_id_fk";
    ALTER TABLE "practice_details" DROP CONSTRAINT IF EXISTS "practice_details_user_id_users_id_fk";
  END IF;
END $$;

-- preferences (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'preferences') THEN
    ALTER TABLE "preferences" DROP CONSTRAINT IF EXISTS "preferences_user_id_users_id_fk";
  END IF;
END $$;

-- customer_details (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customer_details') THEN
    ALTER TABLE "customer_details" DROP CONSTRAINT IF EXISTS "customer_details_user_id_users_id_fk";
  END IF;
END $$;

-- practice_client_intakes (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'practice_client_intakes') THEN
    ALTER TABLE "practice_client_intakes" DROP CONSTRAINT IF EXISTS "practice_client_intakes_organization_id_organizations_id_fk";
  END IF;
END $$;

-- payment_links (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payment_links') THEN
    ALTER TABLE "payment_links" DROP CONSTRAINT IF EXISTS "payment_links_organization_id_organizations_id_fk";
  END IF;
END $$;

-- stripe_connected_accounts (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stripe_connected_accounts') THEN
    ALTER TABLE "stripe_connected_accounts" DROP CONSTRAINT IF EXISTS "stripe_connected_accounts_organization_id_organizations_id_fk";
  END IF;
END $$;

-- events (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'events') THEN
    ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_organization_id_organizations_id_fk";
  END IF;
END $$;

-- event_subscriptions (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'event_subscriptions') THEN
    ALTER TABLE "event_subscriptions" DROP CONSTRAINT IF EXISTS "event_subscriptions_user_id_users_id_fk";
  END IF;
END $$;

--> statement-breakpoint

-- ============================================================================
-- STEP 2: Convert PRIMARY KEY columns (parent tables first)
-- ============================================================================

-- users (parent table - must be converted first)
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- organizations (parent table - must be converted first)
ALTER TABLE "organizations" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;
ALTER TABLE "organizations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- subscriptions
ALTER TABLE "subscriptions" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;
ALTER TABLE "subscriptions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- verifications
ALTER TABLE "verifications" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;
ALTER TABLE "verifications" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- sessions
ALTER TABLE "sessions" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;
ALTER TABLE "sessions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- accounts
ALTER TABLE "accounts" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;
ALTER TABLE "accounts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- members
ALTER TABLE "members" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;
ALTER TABLE "members" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- invitations
ALTER TABLE "invitations" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;
ALTER TABLE "invitations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

--> statement-breakpoint

-- ============================================================================
-- STEP 3: Convert FOREIGN KEY columns
-- ============================================================================

-- accounts.user_id
ALTER TABLE "accounts" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;

-- sessions.user_id, sessions.active_organization_id
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;
ALTER TABLE "sessions" ALTER COLUMN "active_organization_id" SET DATA TYPE uuid USING active_organization_id::uuid;

-- members.organization_id, members.user_id
ALTER TABLE "members" ALTER COLUMN "organization_id" SET DATA TYPE uuid USING organization_id::uuid;
ALTER TABLE "members" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;

-- invitations.organization_id, invitations.inviter_id
ALTER TABLE "invitations" ALTER COLUMN "organization_id" SET DATA TYPE uuid USING organization_id::uuid;
ALTER TABLE "invitations" ALTER COLUMN "inviter_id" SET DATA TYPE uuid USING inviter_id::uuid;

-- organizations.active_subscription_id
ALTER TABLE "organizations" ALTER COLUMN "active_subscription_id" SET DATA TYPE uuid USING active_subscription_id::uuid;

-- subscriptions.reference_id - KEEP AS TEXT (can contain "user" or other non-UUID values)
-- ALTER TABLE "subscriptions" ALTER COLUMN "reference_id" SET DATA TYPE uuid USING reference_id::uuid;

-- practice_details.organization_id, practice_details.user_id (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'practice_details') THEN
    ALTER TABLE "practice_details" ALTER COLUMN "organization_id" SET DATA TYPE uuid USING organization_id::uuid;
    ALTER TABLE "practice_details" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;
  END IF;
END $$;

-- preferences.user_id (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'preferences') THEN
    ALTER TABLE "preferences" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;
  END IF;
END $$;

-- customer_details.user_id (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customer_details') THEN
    ALTER TABLE "customer_details" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;
  END IF;
END $$;

-- practice_client_intakes.organization_id (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'practice_client_intakes') THEN
    ALTER TABLE "practice_client_intakes" ALTER COLUMN "organization_id" SET DATA TYPE uuid USING organization_id::uuid;
  END IF;
END $$;

-- payment_links.organization_id (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payment_links') THEN
    ALTER TABLE "payment_links" ALTER COLUMN "organization_id" SET DATA TYPE uuid USING organization_id::uuid;
  END IF;
END $$;

-- stripe_connected_accounts.organization_id (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stripe_connected_accounts') THEN
    ALTER TABLE "stripe_connected_accounts" ALTER COLUMN "organization_id" SET DATA TYPE uuid USING organization_id::uuid;
  END IF;
END $$;

-- events.organization_id (may not exist) - actor_id stays as TEXT (can be "user", "system", etc.)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'events') THEN
    -- actor_id stays as TEXT - can contain "user", "system", "webhook", etc.
    ALTER TABLE "events" ALTER COLUMN "organization_id" SET DATA TYPE uuid USING organization_id::uuid;
  END IF;
END $$;

-- event_subscriptions.user_id (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'event_subscriptions') THEN
    ALTER TABLE "event_subscriptions" ALTER COLUMN "user_id" SET DATA TYPE uuid USING user_id::uuid;
  END IF;
END $$;

--> statement-breakpoint

-- ============================================================================
-- STEP 4: Re-add all foreign key constraints
-- ============================================================================

-- accounts
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- sessions
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- members
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- invitations
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk"
  FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- practice_details (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'practice_details') THEN
    ALTER TABLE "practice_details" ADD CONSTRAINT "practice_details_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    ALTER TABLE "practice_details" ADD CONSTRAINT "practice_details_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

-- preferences (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'preferences') THEN
    ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

-- customer_details (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customer_details') THEN
    ALTER TABLE "customer_details" ADD CONSTRAINT "customer_details_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

-- practice_client_intakes (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'practice_client_intakes') THEN
    ALTER TABLE "practice_client_intakes" ADD CONSTRAINT "practice_client_intakes_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

-- payment_links (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payment_links') THEN
    ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

-- stripe_connected_accounts (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stripe_connected_accounts') THEN
    ALTER TABLE "stripe_connected_accounts" ADD CONSTRAINT "stripe_connected_accounts_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

-- events (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'events') THEN
    ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

-- event_subscriptions (may not exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'event_subscriptions') THEN
    ALTER TABLE "event_subscriptions" ADD CONSTRAINT "event_subscriptions_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
