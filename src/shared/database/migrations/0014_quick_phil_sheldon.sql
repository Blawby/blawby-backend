ALTER TABLE "events" ALTER COLUMN "actor_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "actor_type" SET NOT NULL;