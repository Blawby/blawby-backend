-- Remove the mistaken invoice-level application fee snapshot now that invoice
-- fees are tracked via metered events and payout audit records instead.
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "application_fee_amount";
