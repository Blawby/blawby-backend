DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_transactions'
      AND column_name = 'application_fee_amount'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_transactions'
      AND column_name = 'metered_fee_cents'
  ) THEN
    ALTER TABLE "billing_transactions"
      RENAME COLUMN "application_fee_amount" TO "metered_fee_cents";
  END IF;
END $$;

ALTER TABLE "billing_transactions"
  ADD COLUMN IF NOT EXISTS "metered_fee_cents" integer DEFAULT 0 NOT NULL;
