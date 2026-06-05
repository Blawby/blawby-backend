---
date: 2026-06-04
topic: observability-and-audit-trail
---

# Observability and Audit Trail

## Summary

Add a permanent, queryable audit trail (`activity_log` table) for user-meaningful domain events, clean up the `events` outbox schema, propagate `trace_id` from HTTP requests through the event pipeline, and use stdout + Cloudflare Container logs for system observability. No new log database or external service is required for MVP.

---

## Problem Frame

Blawby has no audit trail. The `events` outbox table stores domain events but mixes processing queue concerns (retry state, processing flags) with audit concerns. Its `metadata` JSON field is never populated. `event_version` is written but never consumed. `requestId` is generated per request but never reaches the event record — making it impossible to correlate a log entry with the event that caused it.

System logs go to stdout but there is no structured retention or search beyond what Cloudflare Container logs provides. For MVP stability, the team needs to see errors and trace what happened without manually grepping container output.

At MVP scale (no users), the right approach is the simplest one: one new Postgres table for audit, stdout for system telemetry, and `trace_id` as the correlation key between them.

---

## Actors

- A1. **Engineer**: queries `activity_log` and container logs to debug production issues.
- A2. **Client (tenant)**: eventually queries their own audit history via a client-facing API (deferred).
- A3. **Graphile Worker**: processes events from the outbox, fires listeners including the audit writer.

---

## Key Flows

- F1. **User action → audit record**
  - **Trigger:** HTTP request mutates a domain object (matter created, invoice sent, etc.)
  - **Actors:** A3
  - **Steps:**
    1. Hono middleware generates `requestId` via `hono/request-id`, stores in async context via `hono/context-storage`.
    2. Service calls `ctx.emit(EventType, payload)`.
    3. `ctx.emit` reads `requestId` from async context, passes as `trace_id` in `DispatchOptions`.
    4. Event written to `events` table with `trace_id` column populated.
    5. Graphile Worker picks up event, fires all registered listeners.
    6. `activity.listeners.ts` handler writes one row to `activity_log` with `trace_id`, `source_event_id`, `actor_id`, `action`, `resource_type`, `resource_id`, `tenant_id`.
  - **Outcome:** `activity_log` row exists, `trace_id` matches the originating HTTP request's `requestId`.
  - **Covered by:** R1, R2, R3, R4, R5, R6

- F2. **Engineer debugs a production error**
  - **Trigger:** Error reported or alert fired.
  - **Actors:** A1
  - **Steps:**
    1. Find `requestId` from error response body (`request_id` field) or Cloudflare Container log output.
    2. Search `activity_log WHERE trace_id = ?` to find what domain action was in flight.
    3. Search `events WHERE trace_id = ?` to find the raw event payload (if within 30-day retention).
  - **Outcome:** Engineer traces the full request → event → audit chain from one ID.
  - **Covered by:** R3, R7, R8

---

## Requirements

**`events` table schema cleanup**

- R1. Drop `metadata` JSON column from `events` and `events_dead_letter` tables. It is never read by any handler and carries no useful data.
- R2. Drop `event_version` column from `events` and `events_dead_letter` tables. It is written as `'1.0.0'` everywhere and never used for routing. Future versioning uses new event type names, not a version field.
- R3. Add `trace_id TEXT` column to `events` and `events_dead_letter` tables. Nullable — system/worker-initiated events have no HTTP request context.

**`trace_id` propagation**

- R4. `hono/context-storage` middleware is added to the Hono app (built into Hono, no new dependency). It makes the Hono context available via `getContext()` anywhere in the request lifecycle.
- R5. `ctx.emit()` in `createServiceContext` reads `requestId` from `getContext()` and passes it as `trace_id` in `DispatchOptions`. When no Hono context is present (worker/listener), `trace_id` is `undefined`.
- R6. `BaseEvent.dispatch()` writes `trace_id` from `DispatchOptions` to the `events.trace_id` column.

**`activity_log` table**

- R7. A new `activity_log` table is created as a Postgres range-partitioned table, partitioned by `created_at` (yearly). The partition key is included in the primary key: `PRIMARY KEY (id, created_at)`.
- R8. Three yearly partitions are pre-created (2026, 2027, 2028) via raw SQL migration. Drizzle schema definition is not used for this table — partitioned table DDL requires raw SQL.
- R9. `activity_log` columns: `id UUID`, `tenant_id UUID`, `actor_id UUID`, `actor_type TEXT`, `action TEXT`, `resource_type TEXT`, `resource_id UUID`, `trace_id TEXT`, `source_event_id UUID` (soft reference — no FK constraint), `metadata JSONB`, `created_at TIMESTAMPTZ`.
- R10. Indexes: `(tenant_id, created_at DESC)` for client-facing audit queries; `(trace_id)` for engineer debug correlation; `(resource_type, resource_id, created_at DESC)` for resource-scoped history.
- R11. `activity_log` records are never deleted. GDPR anonymization sets `actor_id` to null; the row is retained.

**Centralized audit listener**

- R12. A new `src/shared/events/listeners/activity.listeners.ts` file registers `Event.listen()` handlers for all auditable events. This file is the single place to see which events write to `activity_log`.
- R13. Each handler in `activity.listeners.ts` writes exactly one row to `activity_log` and does nothing else. No emails, no notifications — those are separate listeners in module-specific `listeners.ts` files.
- R14. Auditable events (initial list): `MatterCreated`, `MatterUpdated`, `MatterDeleted`, `ClientCreated`, `ClientUpdated`, `ClientDeleted`, `InvoiceCreated`, `InvoiceSent`, `InvoicePaid`, `InvoiceVoided`, `InvoiceDeleted`, `AuthUserSignedUp`, `PracticeCreated`, and practice settings changes.
- R15. Non-auditable events (never write to `activity_log`): Stripe reconciliation events, `SystemHealthCheckPerformed`, `SessionCreated`, `SessionExpired`, `SessionInvalidated`, worker retry events.
- R16. `action` values are defined as `as const` string constants in each event definition file. No DB enum. Convention: `'resource.verb'` (e.g., `'matter.created'`, `'invoice.sent'`).

**`events` table pruning**

- R17. Processed `events` rows are pruned after 30 days via a Graphile Worker cron task. Rows in `events_dead_letter` are not pruned automatically — they require manual resolution.

**Dispatch standardization**

- R18. All `EventClass.dispatch()` calls inside service files (`src/modules/*/services/`) are replaced with `ctx.emit()`. Direct dispatch remains valid in workers, listeners, and background jobs.

**System observability**

- R19. System telemetry (errors, warnings, request traces) uses stdout via LogTape. No separate `sys_logs` database table. Cloudflare Container logs capture stdout automatically.
- R20. No Loki or external log aggregation service is added for MVP. Loki is the designated upgrade path when CF Container log search becomes insufficient.

---

## Acceptance Examples

- AE1. **Covers R5, R6, R3.** Given an HTTP request creates a matter, when `ctx.emit(MatterCreated, payload)` is called, the `events` row has `trace_id` equal to the request's `requestId`. The same `trace_id` appears on the resulting `activity_log` row.

- AE2. **Covers R5.** Given a Graphile Worker task (no HTTP context) dispatches an event, `trace_id` on the `events` row is `null`. The `activity_log` row has `trace_id = null`.

- AE3. **Covers R11.** Given a client cancels their account, when GDPR deletion is requested, `activity_log` rows for that tenant have `actor_id` set to `null` but the rows are not deleted.

- AE4. **Covers R13.** Given `InvoiceSent` fires and both an email listener and the audit listener are registered, if the audit write fails and Graphile Worker retries the event, the email listener runs again. Both listeners are independent `Event.listen()` registrations in separate files.

- AE5. **Covers R7, R8.** Given an `activity_log` row is inserted with `created_at = '2027-06-15'`, it lands in the `activity_log_2027` partition. Queries scoped to `tenant_id` against recent data scan only the relevant partition.

---

## Success Criteria

- Every HTTP-initiated domain event has a populated `trace_id` on its `events` row.
- Every auditable domain event produces exactly one `activity_log` row within Graphile Worker's normal processing window.
- An engineer can look up all activity for a given `trace_id` via: `SELECT * FROM activity_log WHERE trace_id = ?`.
- `events` table has no `metadata` or `event_version` columns.
- `activity_log` is partitioned and accepts inserts without manual partition management for at least 3 years.

---

## Scope Boundaries

- Client-facing audit API (`GET /api/practices/:id/audit`) is deferred. The data is in `activity_log` but no HTTP route exposes it yet.
- Loki + Grafana observability stack is deferred. CF Container logs are sufficient for MVP.
- Hot/warm/cold storage (R2 archiving of old partitions) is deferred. Partitioned table structure supports it without retrofitting.
- `REQUIRES_NEW` transaction propagation for `activity_log` writes (independent commit) is deferred.
- Upload-specific audit log (`upload_audit_logs` table) is not merged into `activity_log` in this iteration.
- Automated partition creation beyond 2028 is deferred — add `pg_partman` when needed.

---

## Key Decisions

- **Partitioned from day one**: Retrofitting Postgres table partitioning on an existing large table requires recreating the table. Creating it partitioned at zero rows costs nothing and avoids future pain.
- **Yearly partitions**: Coarse enough to avoid constant management. Cold archiving (R2) operates at the partition level — yearly gives a reasonable archiving granularity.
- **Soft reference (`source_event_id`)**: No FK constraint between `activity_log` and `events`. Events are pruned after 30 days; `activity_log` is permanent. The UUID is still useful for log correlation even after the source row is gone.
- **Centralized audit listener**: All auditable events visible in one file. Per-module listeners handle their own side effects only.
- **stdout for system logs**: No `sys_logs` table. Writing errors to a database during a database failure is circular. CF Container logs are the system log store for MVP.
- **`action` as free-form text**: No DB enum. New event types require no migration. TypeScript `as const` enforces correctness at compile time.

---

## Dependencies / Assumptions

- Graphile Worker cron task pattern already exists (`cleanup-email-logs.ts`). The 30-day events pruning cron follows the same pattern.
- `hono/request-id` middleware is already installed and active. `hono/context-storage` is built into Hono — no additional package install.
- Raw SQL migration is required for the partitioned `activity_log` table. Drizzle schema definition (`pgTable`) does not support `PARTITION BY RANGE`.
- `events_dead_letter` schema mirrors `events` — both receive the same column changes (drop `metadata`, drop `event_version`, add `trace_id`).

---

## Outstanding Questions

### Deferred to Planning

- [Affects R14] (Technical) Confirm `AuthUserSignedUp` payload includes sufficient data to populate `actor_id` and `tenant_id` on `activity_log` — the user may not yet have an organization at signup time.
- [Affects R8] (Technical) Confirm Cloudflare Containers + Railway Postgres supports raw SQL DDL migrations for partitioned tables without special configuration.
- [Affects R17] (Technical) Identify the correct Graphile Worker cron task pattern for the 30-day events pruning job — reference `src/workers/tasks/cleanup-email-logs.ts`.
