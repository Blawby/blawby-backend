ALTER TABLE "engagement_contracts" DROP CONSTRAINT "engagement_contracts_matter_id_matters_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "engagement_contracts_unique_accepted_per_matter_idx";
DROP INDEX IF EXISTS "engagement_contracts_matter_accepted_unique";--> statement-breakpoint
ALTER TABLE "engagement_contracts" ALTER COLUMN "matter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "engagement_contracts" ADD COLUMN "intake_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "engagement_contracts" ADD CONSTRAINT "engagement_contracts_intake_id_practice_client_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."practice_client_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_contracts" ADD CONSTRAINT "engagement_contracts_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engagement_contracts_intake_idx" ON "engagement_contracts" USING btree ("intake_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_contracts_unique_accepted_per_intake_idx" ON "engagement_contracts" USING btree ("intake_id") WHERE "engagement_contracts"."status" = 'accepted';