-- Custom SQL migration file, put your code below! --
-- 0012_funny_zarda.sql dropped this constraint and made the column nullable, but that file was
-- never wired into meta/_journal.json (lost during the migration reset in 47644ab), so it never ran.
-- Re-applying it here, guarded, so environments that already carry the fix are unaffected.
ALTER TABLE "practice_client_intakes" DROP CONSTRAINT IF EXISTS "practice_client_intakes_stripe_payment_intent_id_unique";--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ALTER COLUMN "stripe_payment_intent_id" DROP NOT NULL;