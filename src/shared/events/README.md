# Event System (Transactional Outbox Pattern)

This document describes the **event system implementation** in `src/shared/events/`:

- **Transactional Outbox Pattern**: Events are written to the `events` table within business transactions, guaranteeing zero data loss.
- **Worker Polling**: Graphile Workers poll the `events` table for unprocessed events and dispatch them to registered handlers.
- **Single Processing Path**: All events are processed asynchronously via workers for reliability, retry logic, and guaranteed delivery.

---

## Purpose

The event system provides a consistent way to:

- Emit domain/application events (e.g. practice created, payment succeeded, onboarding completed).
- Guarantee zero data loss by writing events within business transactions (Transactional Outbox Pattern).
- Fan out one event to multiple handlers (email, analytics, internal projections).
- Process all events asynchronously via Graphile Workers for reliability and retry logic.
- Persist all events to the database for auditability, replay, and backfill.

---

## Architecture

### Transactional Outbox Pattern

```
Business Transaction
  ├─ Insert/Update Business Data
  ├─ Insert Event to `events` table (same transaction)
  └─ Commit Transaction
       ↓
Graphile Worker (polls events table)
  ├─ Queries for unprocessed events (processed = false)
  ├─ Dispatches to registered handlers
  └─ Updates processed/retry_count/last_error
```

**Key Benefits:**
- **Zero data loss**: Events are written atomically with business data
- **Reliable processing**: Workers can retry failed events
- **Observability**: Track processing status, retry counts, and errors

---

## Key Files

- **Schema**: `src/shared/events/schemas/events.schema.ts`
- **Publisher**: `src/shared/events/event-publisher.ts`
  - `publishEventTx(tx, event)` - Transactional publishing (preferred)
  - `publishSimpleEvent(eventType, actorId, organizationId, payload)` - Non-transactional publishing (for external APIs)
- **Handler registration**: `src/shared/events/event-consumer.ts`
- **Handler registry**: `src/shared/events/event-handler-registry.ts`
- **Graphile Worker task**: `src/shared/events/tasks/process-outbox-event.ts`
- **Handlers**: `src/shared/events/handlers/*.events.ts`, `src/modules/*/events/*.events.ts`
- **Event types enum**: `src/shared/events/enums/event-types.ts`
- **Constants**: `src/shared/events/constants.ts` - System actor UUIDs

---

## Data Model

### `BaseEvent`

`BaseEvent` is the canonical in-memory event payload.

- **`eventId`**: UUID string (primary key in database).
- **`type`**: string key (usually from `EventType` enum) - renamed from `eventType`.
- **`eventVersion`**: semantic version string (default `1.0.0`).
- **`timestamp`**: Date generated at publish-time.
- **`actorId`**: UUID identifier for the actor (user UUID, system UUID, etc.) - changed from optional string to required UUID.
- **`actorType`**: type label for the actor (`user`, `system`, `webhook`, `cron`, `api`).
- **`organizationId`**: optional UUID for multi-tenant context.
- **`payload`**: JSON object with event-specific fields.
- **`metadata`**: request/system metadata (ip, user agent, request id, source, environment).
- **`processed`**: boolean indicating if event has been processed by workers.
- **`retryCount`**: number of retry attempts.

Source: `src/shared/events/schemas/events.schema.ts`

---

## Database Table: `events`

The `events` table stores all events using the Transactional Outbox Pattern.

### Schema (Post-Migration)

Columns (source: `src/shared/events/schemas/events.schema.ts` and migration `0012_events_schema_update.sql`):

- **Primary Key**
  - **`event_id`** (`eventId`): UUID primary key (renamed from `id`).

- **Event Classification**
  - **`type`** (`type`): event name (renamed from `event_type`).
  - **`event_version`** (`eventVersion`): schema/version of the event.

- **Actor / Tenant context**
  - **`actor_id`** (`actorId`): UUID - who did it (user UUID, system UUID, etc.) - changed from text to UUID.
  - **`actor_type`** (`actorType`): what kind of actor (`user`, `system`, `webhook`, `cron`, `api`).
  - **`organization_id`** (`organizationId`): tenant scope (UUID). References `organizations.id` with `ON DELETE SET NULL`.

- **Data**
  - **`payload`**: JSON payload.
  - **`metadata`**: JSON metadata (includes `original_actor_id` for migrated string values).

- **Processing state**
  - **`processed`**: boolean - `false` until worker processes the event.
  - **`processed_at`**: timestamp when processing completes.
  - **`retry_count`**: integer for failures/retries.
  - **`last_error`**: last failure message.

- **Timestamps**
  - **`created_at`**: timestamp when event was created.

### System Actor UUIDs

For system-generated events, use constant UUIDs from `src/shared/events/constants.ts`:

- `SYSTEM_ACTOR_UUID`: `00000000-0000-0000-0000-000000000000`
- `WEBHOOK_ACTOR_UUID`: `00000000-0000-0000-0000-000000000001`
- `CRON_ACTOR_UUID`: `00000000-0000-0000-0000-000000000002`
- `API_ACTOR_UUID`: `00000000-0000-0000-0000-000000000003`
- `ORGANIZATION_ACTOR_UUID`: `00000000-0000-0000-0000-000000000004`

### Migration Notes

The migration (`0012_events_schema_update.sql`) handles:

1. Renaming `id` → `event_id` (UUID primary key)
2. Dropping old `event_id` text column
3. Converting `actor_id` from text to UUID:
   - Valid UUID strings are cast directly
   - Known string literals (`'system'`, `'webhook'`, `'cron'`, `'api'`) are mapped to constant UUIDs
   - Unknown values default to `SYSTEM_ACTOR_UUID` with original value preserved in `metadata.original_actor_id`
4. Renaming `event_type` → `type`
5. Adding Postgres `NOTIFY` trigger (optional, for future real-time processing)

---

## Publishing Events

### Transactional Publishing (Preferred)

Use `publishEventTx(tx, event)` within database transactions:

```typescript
await db.transaction(async (tx) => {
  // 1. Business logic
  const practice = await tx.insert(practices).values(data).returning();
  
  // 2. Publish event within same transaction
  await publishEventTx(tx, {
    type: EventType.PRACTICE_CREATED,
    actorId: user.id, // Automatically resolved to UUID
    actorType: 'user',
    organizationId: practice.organizationId,
    payload: {
      practice_id: practice.id,
      name: practice.name,
    },
  });
});
```

**Benefits:**
- Event is written atomically with business data
- Zero data loss guarantee
- Event will be processed by workers even if process crashes

### Non-Transactional Publishing (For External APIs)

When calling external APIs (e.g., Stripe, Better Auth), use `publishEvent()` or helpers:

```typescript
// After external API call (not in transaction)
const stripeCustomer = await stripe.customers.create(...);

// Event is still persisted via event consumer
void publishSimpleEvent(
  EventType.STRIPE_CUSTOMER_CREATED,
  userId, // Automatically resolved to UUID
  undefined,
  { stripe_customer_id: stripeCustomer.id }
);
```

**Note:** Events are still persisted via `saveEventToDatabase()` in the event consumer, but they're not atomic with external API calls.

### Helper Functions

- `publishPracticeEvent(eventType, actorId, organizationId, payload, requestHeaders?)` - For practice/org events
- `publishUserEvent(eventType, actorId, payload, requestHeaders?)` - For user events
- `publishSystemEvent(eventType, payload, actorId?, actorType?, organizationId?)` - For system events
- `publishSimpleEvent(eventType, actorId, organizationId, payload)` - Simple one-liner

> **Note:** `resolveActorId()` is now internal - all helper functions automatically convert string actor IDs to UUIDs.

**Guideline:** If an event is scoped to an organization, prefer helpers that set **`organizationId`** explicitly (e.g. `publishPracticeEvent` or `publishSystemEvent(..., organizationId)`).

### Actor ID Resolution

Actor ID resolution is handled automatically by all publish functions:

- Valid UUIDs are returned as-is
- Known strings (`'system'`, `'webhook'`, `'cron'`, `'api'`, `'organization'`) are mapped to constant UUIDs
- Unknown values default to `SYSTEM_ACTOR_UUID`

---

## Consuming Events

### Handler Registration

Handlers are registered at application boot in `src/boot/event-handlers.ts`:

```typescript
export const bootEventHandlers = (): void => {
  registerPracticeEvents();
  registerStripeCustomerEvents();
  registerEmailEvents();
  // ...
};
```

### Event Handler Registration

Use `subscribeToEvent(eventType, handler, options?)` to register handlers:

```typescript
subscribeToEvent(EventType.PRACTICE_CREATED, async (event: BaseEvent) => {
  console.info('Practice created', event.payload);
  // Handler will be called by outbox worker when event is processed
});
```

**How it works:**
1. Events are published via `publishEventTx()` or `publishSimpleEvent()`
2. Events are stored in `events` table with `processed = false`
3. `process-outbox-event` worker polls the table
4. Worker dispatches events to registered handlers via `dispatchEventToHandlers()`
5. Updates `processed = true` after successful processing
6. Retries failed events up to `MAX_RETRIES` times

**Benefits:**
- Guaranteed delivery (events persist in database)
- Automatic retries for failed handlers
- Error tracking and observability
- Can replay events for debugging

---

## Worker Processing

### Graphile Worker Task

The `process-outbox-event` task (`src/shared/events/tasks/process-outbox-event.ts`):

1. Queries `events` table for unprocessed events (`processed = false`)
2. Processes events in batches (default: 10 at a time)
3. Dispatches to registered handlers via `dispatchEventToHandlers()`
4. Updates processing status:
   - On success: `processed = true`, `processed_at = now()`
   - On failure: `retry_count++`, `last_error = error message`

### Handler Registry

Handlers registered via `subscribeToEvent()` are accessible to workers through the handler registry:

- `setEventHandlersMap()` - Exports handlers map from event-consumer
- `dispatchEventToHandlers()` - Called by worker to execute handlers

### Polling vs Real-Time

Currently, workers **poll** the `events` table directly. The Postgres `NOTIFY` trigger is included in the migration for potential future real-time processing, but is not actively used.

---

## Practice Events (Organizations = Practices)

In our domain model, **organizations = practices**. Practice events are registered in `src/modules/practice/events/practice.events.ts`:

- `PRACTICE_CREATED` - Practice/organization created
- `PRACTICE_UPDATED` - Practice/organization updated
- `PRACTICE_DELETED` - Practice/organization deleted
- `PRACTICE_DETAILS_CREATED` - Practice details created
- `PRACTICE_DETAILS_UPDATED` - Practice details updated
- `PRACTICE_DETAILS_DELETED` - Practice details deleted
- `PRACTICE_SWITCHED` - Active practice/organization switched

All practice events include `organizationId` since orgs = practices.

---

## Event Versioning

Events use `event_version` for forward compatibility:

- Default: `1.0.0`
- Increment when payload shape changes in a breaking way
- Handlers can branch logic based on version
- Supports multiple payload schemas in parallel

---

## Gotchas / FAQs

### "Why is `actor_id` a UUID now?"

To enforce strict typing and consistency:
- `actor_id` must be a UUID (not a string literal)
- Publish functions automatically convert string IDs to UUIDs
- System actors use constant UUIDs from `constants.ts`

### "Why is `organization_id` sometimes null?"

Some events are user-level, not organization-level:
- User signup/login events don't have `organizationId`
- Stripe customer events are user-level
- Practice/payment events should always include `organizationId`

**Fix pattern:**
- Use `publishPracticeEvent()` for org-scoped events
- Use `publishSystemEvent(..., organizationId)` when organization context is available
- Ensure `organizationId` is passed when creating practice/payment events

### "How do I know if an event was processed?"

Check the `events` table:
- `processed = true` → Event was successfully processed
- `processed = false` → Event is pending or failed
- `retry_count > 0` → Event failed and was retried
- `last_error` → Error message from last failure

### "Can I replay events?"

Yes! Events are persisted with full payloads. You can:
1. Query `events` table for specific events
2. Reset `processed = false` to reprocess
3. Workers will pick them up on next poll

---

## Suggested Conventions

- **Event type naming**: `DOMAIN_ACTION` (e.g. `PRACTICE_CREATED`, `PAYMENT_SUCCEEDED`)
- **Versioning**: Increment `event_version` when payload shape changes in a breaking way
- **Actor fields**
  - `actorId`: UUID identifier (string IDs are automatically converted)
  - `actorType`: one of `user|system|webhook|cron|api`
- **Org scoping**
  - Set `organizationId` whenever the event belongs to a tenant
  - Keep org id out of payload unless it's truly part of domain data
- **Transactional publishing**
  - Use `publishEventTx()` within `db.transaction()` for database operations
  - Use `publishEvent()` or helpers for external API calls

---

## Migration Reference

- Initial creation: `src/shared/database/migrations/0000_loose_catseye.sql`
- Schema update (UUID PK, actor_id UUID, type rename): `src/shared/database/migrations/0012_events_schema_update.sql`
