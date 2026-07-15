ALTER TABLE "practice_client_intakes" ADD COLUMN "invitation_prefill_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "invitation_prefill_token_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "practice_client_intakes_invitation_prefill_token_idx" ON "practice_client_intakes" USING btree ("invitation_prefill_token_hash");
