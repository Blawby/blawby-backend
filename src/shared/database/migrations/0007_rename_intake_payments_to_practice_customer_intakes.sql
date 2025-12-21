-- Rename intake_payments table to practice_customer_intakes
-- This migration renames the table and all associated indexes

-- Rename the table
ALTER TABLE "intake_payments" RENAME TO "practice_customer_intakes";

-- Rename all indexes
ALTER INDEX "intake_payments_org_idx" RENAME TO "practice_customer_intakes_org_idx";
ALTER INDEX "intake_payments_stripe_intent_idx" RENAME TO "practice_customer_intakes_stripe_intent_idx";
ALTER INDEX "intake_payments_ulid_idx" RENAME TO "practice_customer_intakes_ulid_idx";
ALTER INDEX "intake_payments_status_idx" RENAME TO "practice_customer_intakes_status_idx";
ALTER INDEX "intake_payments_created_at_idx" RENAME TO "practice_customer_intakes_created_at_idx";

-- Note: Foreign key constraints and unique constraints will automatically use the new table name
-- No need to explicitly rename them as PostgreSQL handles this automatically
