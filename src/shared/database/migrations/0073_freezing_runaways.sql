ALTER TABLE "pending_actions" DROP CONSTRAINT "pending_actions_status_check";--> statement-breakpoint
DROP INDEX "idx_pending_actions_idempotency_key";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pending_actions_active_idempotency" ON "pending_actions" USING btree ("organization_id","tool_name","idempotency_key") WHERE "pending_actions"."status" IN ('pending', 'executing');--> statement-breakpoint
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_status_check" CHECK (status IN ('pending', 'rejected', 'executing', 'executed', 'failed', 'expired'));