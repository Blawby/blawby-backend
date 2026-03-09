DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_transactions'
      AND column_name = 'application_fee_amount'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_transactions'
      AND column_name = 'metered_fee_cents'
  ) THEN
    UPDATE "billing_transactions"
      SET "metered_fee_cents" = "application_fee_amount"::integer
      WHERE ("metered_fee_cents" IS NULL OR "metered_fee_cents" = 0)
        AND "application_fee_amount" IS NOT NULL;
  END IF;

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_transactions'
      AND column_name = 'metered_fee_cents'
  ) THEN
    ALTER TABLE "billing_transactions"
      ALTER COLUMN "metered_fee_cents" TYPE integer USING "metered_fee_cents"::integer;
    ALTER TABLE "billing_transactions"
      ALTER COLUMN "metered_fee_cents" SET DEFAULT 0;
    UPDATE "billing_transactions"
      SET "metered_fee_cents" = 0
      WHERE "metered_fee_cents" IS NULL;
    ALTER TABLE "billing_transactions"
      ALTER COLUMN "metered_fee_cents" SET NOT NULL;
  ELSE
    ALTER TABLE "billing_transactions"
      ADD COLUMN "metered_fee_cents" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
