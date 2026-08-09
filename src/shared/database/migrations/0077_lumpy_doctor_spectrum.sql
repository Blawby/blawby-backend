CREATE TABLE "krabiclaw_organization_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_organization_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "krabiclaw_user_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_user_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "krabiclaw_organization_links" ADD CONSTRAINT "krabiclaw_organization_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "krabiclaw_user_links" ADD CONSTRAINT "krabiclaw_user_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "krabiclaw_organization_links_external_id_idx" ON "krabiclaw_organization_links" USING btree ("external_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "krabiclaw_organization_links_organization_id_idx" ON "krabiclaw_organization_links" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "krabiclaw_user_links_external_id_idx" ON "krabiclaw_user_links" USING btree ("external_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "krabiclaw_user_links_user_id_idx" ON "krabiclaw_user_links" USING btree ("user_id");