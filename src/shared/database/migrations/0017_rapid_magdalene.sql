CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"template_name" text NOT NULL,
	"template_data" json NOT NULL,
	"status" text NOT NULL,
	"message_id" text,
	"error_message" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
