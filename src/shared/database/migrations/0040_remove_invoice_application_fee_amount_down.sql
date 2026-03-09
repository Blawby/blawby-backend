ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "application_fee_amount" integer DEFAULT 0 NOT NULL;
