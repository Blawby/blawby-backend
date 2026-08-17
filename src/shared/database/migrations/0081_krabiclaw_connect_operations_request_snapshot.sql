-- Expand: add the new snapshot columns as nullable first, since existing rows (from migration
-- 0079) predate the request-snapshot fields and have no authoritative source for them.
ALTER TABLE "krabiclaw_connect_operations" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "krabiclaw_connect_operations" ADD COLUMN "refresh_url" text;--> statement-breakpoint
ALTER TABLE "krabiclaw_connect_operations" ADD COLUMN "return_url" text;--> statement-breakpoint

-- Backfill (invalidate): a 'pending' legacy row cannot be safely resumed without a real snapshot
-- — retrying it would fabricate Stripe call parameters — so mark it terminally failed instead.
UPDATE "krabiclaw_connect_operations"
SET "status" = 'failed',
    "error_message" = 'Invalidated by migration 0081: created before request-snapshot fields existed'
WHERE "status" = 'pending' AND ("email" IS NULL OR "refresh_url" IS NULL OR "return_url" IS NULL);--> statement-breakpoint

-- Backfill (placeholder): any remaining legacy rows (already 'succeeded' or 'failed') keep their
-- historical status — only their snapshot is unknown — so fill it with an inert placeholder
-- rather than reclassifying a completed operation as failed.
UPDATE "krabiclaw_connect_operations"
SET "email" = COALESCE("email", 'unknown@invalid.blawby.local'),
    "refresh_url" = COALESCE("refresh_url", 'about:blank'),
    "return_url" = COALESCE("return_url", 'about:blank')
WHERE "email" IS NULL OR "refresh_url" IS NULL OR "return_url" IS NULL;--> statement-breakpoint

-- Contract: every row now has a non-null snapshot, so the NOT NULL constraint is safe to enforce.
ALTER TABLE "krabiclaw_connect_operations" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "krabiclaw_connect_operations" ALTER COLUMN "refresh_url" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "krabiclaw_connect_operations" ALTER COLUMN "return_url" SET NOT NULL;
