ALTER TABLE "practice_client_intakes" ADD COLUMN "address_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_client_intakes" ADD CONSTRAINT "practice_client_intakes_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;