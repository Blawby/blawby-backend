-- Align refund request creator field naming and FK target with user_details semantics.
-- This is deploy-safe:
-- 1) add nullable column
-- 2) backfill from legacy column/client field
-- 3) enforce NOT NULL
-- 4) drop legacy column

ALTER TABLE refund_requests
  ADD COLUMN IF NOT EXISTS created_by_user_details_id UUID REFERENCES user_details(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'refund_requests'
      AND column_name = 'created_by_user_id'
  ) THEN
    EXECUTE $sql$
      UPDATE refund_requests
      SET created_by_user_details_id = COALESCE(
        created_by_user_details_id,
        created_by_user_id,
        client_user_details_id
      )
      WHERE created_by_user_details_id IS NULL
    $sql$;
  ELSE
    EXECUTE $sql$
      UPDATE refund_requests
      SET created_by_user_details_id = client_user_details_id
      WHERE created_by_user_details_id IS NULL
    $sql$;
  END IF;
END $$;

ALTER TABLE refund_requests
  ALTER COLUMN created_by_user_details_id SET NOT NULL;

ALTER TABLE refund_requests
  DROP COLUMN IF EXISTS created_by_user_id;
