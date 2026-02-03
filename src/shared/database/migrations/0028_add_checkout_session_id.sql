ALTER TABLE "practice_client_intakes" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_client_intakes_stripe_checkout_session_id_unique" ON "practice_client_intakes" ("stripe_checkout_session_id");
