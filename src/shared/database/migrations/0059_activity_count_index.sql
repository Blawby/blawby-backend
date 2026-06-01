CREATE INDEX IF NOT EXISTS "matter_activity_log_matter_created_at_idx"
  ON "matter_activity_log" USING btree ("matter_id", "created_at");
