ALTER TABLE "matters" ADD COLUMN "retainer_cap" integer;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_retainer_cap_non_negative" CHECK ("matters"."retainer_cap" >= 0);