CREATE TABLE "krabiclaw_connect_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"connected_account_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "krabiclaw_connect_operations_status_check" CHECK ("krabiclaw_connect_operations"."status" IN ('pending', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "krabiclaw_connect_operations" ADD CONSTRAINT "krabiclaw_connect_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_connected_accounts" ADD CONSTRAINT "stripe_connected_accounts_id_organization_id_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "krabiclaw_connect_operations" ADD CONSTRAINT "krabiclaw_connect_operations_connected_account_org_fk" FOREIGN KEY ("connected_account_id","organization_id") REFERENCES "public"."stripe_connected_accounts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "krabiclaw_connect_operations_org_request_idx" ON "krabiclaw_connect_operations" USING btree ("organization_id","request_key");--> statement-breakpoint
CREATE INDEX "krabiclaw_connect_operations_status_idx" ON "krabiclaw_connect_operations" USING btree ("status");
