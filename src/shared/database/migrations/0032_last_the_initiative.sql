ALTER TABLE "matters" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "intake_uuid" uuid;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "on_behalf_of" text;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "urgency" varchar(20);--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "desired_outcome" text;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "court_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "has_documents" boolean;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "income" integer;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "household_size" integer;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "case_strength" real;--> statement-breakpoint
CREATE INDEX "matters_intake_uuid_idx" ON "matters" USING btree ("intake_uuid");--> statement-breakpoint
CREATE INDEX "matters_conversation_id_idx" ON "matters" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "practice_client_intakes_urgency_idx" ON "practice_client_intakes" USING btree ("urgency");--> statement-breakpoint
CREATE INDEX "practice_client_intakes_court_date_idx" ON "practice_client_intakes" USING btree ("court_date");