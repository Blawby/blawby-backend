CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_account_id" text NOT NULL,
	"stripe_payout_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"type" text,
	"method" text,
	"description" text,
	"statement_descriptor" text,
	"failure_code" text,
	"failure_message" text,
	"destination_id" text,
	"balance_transaction_id" text,
	"automatic" boolean DEFAULT false NOT NULL,
	"arrival_date" timestamp with time zone,
	"stripe_created_at" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_stripe_payout_id_unique" UNIQUE("stripe_payout_id")
);
--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payouts_organization_idx" ON "payouts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payouts_stripe_account_idx" ON "payouts" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payouts_arrival_date_idx" ON "payouts" USING btree ("arrival_date");--> statement-breakpoint
CREATE INDEX "payouts_stripe_created_at_idx" ON "payouts" USING btree ("stripe_created_at");