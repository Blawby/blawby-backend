CREATE TABLE "events_dead_letter" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_version" text DEFAULT '1.0.0' NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"organization_id" uuid,
	"payload" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"last_error" text,
	"retry_count" integer NOT NULL,
	"failed_at" timestamp DEFAULT now() NOT NULL,
	"original_created_at" timestamp NOT NULL
);
