CREATE TABLE "trust_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"statement_ending_at" timestamp with time zone NOT NULL,
	"bank_statement_balance" integer NOT NULL,
	"trust_book_balance" integer NOT NULL,
	"client_ledger_balance" integer NOT NULL,
	"bank_to_book_variance" integer NOT NULL,
	"book_to_client_variance" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"source" varchar(30) DEFAULT 'manual_statement' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_reconciliations_bank_balance_non_negative" CHECK ("trust_reconciliations"."bank_statement_balance" >= 0),
	CONSTRAINT "trust_reconciliations_book_balance_non_negative" CHECK ("trust_reconciliations"."trust_book_balance" >= 0),
	CONSTRAINT "trust_reconciliations_client_balance_non_negative" CHECK ("trust_reconciliations"."client_ledger_balance" >= 0),
	CONSTRAINT "trust_reconciliations_status_check" CHECK ("trust_reconciliations"."status" IN ('balanced', 'variance')),
	CONSTRAINT "trust_reconciliations_source_check" CHECK ("trust_reconciliations"."source" IN ('manual_statement', 'bank_integration'))
);
--> statement-breakpoint
ALTER TABLE "trust_reconciliations" ADD CONSTRAINT "trust_reconciliations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_reconciliations" ADD CONSTRAINT "trust_reconciliations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trust_reconciliations_org_idempotency_idx" ON "trust_reconciliations" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "trust_reconciliations_org_created_idx" ON "trust_reconciliations" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "trust_reconciliations_org_statement_idx" ON "trust_reconciliations" USING btree ("organization_id","statement_ending_at");
