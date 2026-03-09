-- Remove the mistaken invoice-level application fee snapshot now that refunds
-- and metered billing are sourced from billing transactions/events instead.
-- Schedule this transactional ALTER TABLE during low-traffic windows.
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "application_fee_amount";
