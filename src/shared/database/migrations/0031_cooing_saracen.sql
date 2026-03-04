CREATE TABLE "app_configs" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
