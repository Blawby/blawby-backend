DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'refund_requests'
  ) THEN
    ALTER TABLE "refund_requests"
      DROP CONSTRAINT IF EXISTS "check_executed_fields";

    ALTER TABLE "refund_requests"
      ADD CONSTRAINT "check_executed_fields"
      CHECK (
        status <> 'executed' OR (
          executed_amount IS NOT NULL AND
          executed_at IS NOT NULL AND
          executed_by_user_id IS NOT NULL
        )
      );
  END IF;
END $$;
