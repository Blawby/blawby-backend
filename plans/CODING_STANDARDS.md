# Coding Standards

**Last Updated:** February 21, 2026
**Status:** Active

---

## Table of Contents

1. [Timestamp & Date Handling](#timestamp--date-handling)
2. [Zod Validation Conventions](#zod-validation-conventions)
3. [Service Layer Conventions](#service-layer-conventions)
4. [Stripe Integration Conventions](#stripe-integration-conventions)
5. [General Patterns](#general-patterns)

---

## Timestamp & Date Handling

### Database Schema (Drizzle ORM)

All timestamp columns MUST use `withTimezone` and `mode: 'date'`:

```typescript
// Timestamp columns (datetime)
created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),

// Date-only columns (rare - e.g. milestone due dates)
due_date: date('due_date').notNull(),  // stores "YYYY-MM-DD" string
```

- PostgreSQL type: `TIMESTAMPTZ` (timestamp with time zone)
- Drizzle returns: JS `Date` objects for `timestamp` columns, strings for `date` columns

### Zod Validation Schemas

#### Input Schemas (JSON body from API requests)

```typescript
// DateTime input fields
start_time: z.iso.datetime(),           // validates "2024-01-15T10:30:00Z"
court_date: z.iso.datetime().optional(),

// Date-only input fields
open_date: z.iso.date().optional(),     // validates "2024-01-15"
birthday: z.iso.date().optional(),
due_date: z.iso.date(),

// NEVER use for inputs:
// z.date()         - JSON cannot contain Date objects, will always fail
// z.coerce.date()  - too lenient, accepts invalid formats like "potato"
```

#### Response Schemas (data returned from services/DB)

```typescript
// All timestamp/date response fields
created_at: z.date(),                    // matches Drizzle Date output
updated_at: z.date(),
deleted_at: z.date().nullable(),
succeeded_at: z.date().nullable(),

// NEVER use for responses:
// z.iso.datetime()  - returns string, but Drizzle gives Date objects
// z.string()        - same issue, type mismatch with Date
```

#### Query Parameter Schemas

```typescript
// z.coerce.date() IS acceptable for query params
// (query params are always strings, need coercion to Date for DB comparison)
start_date: z.coerce.date().optional(),
end_date: z.coerce.date().optional(),
```

### Why This Convention Works

```
JSON Request  →  z.iso.datetime()  →  string  →  new Date(str)  →  DB (Date)
                 (validates format)    (safe)     (service layer)   (Drizzle insert)

DB (Date)     →  service returns Date  →  JSON.stringify  →  Date.toJSON()  →  ISO string
                 (no conversion needed)   (automatic)        (automatic)       (client gets string)
```

`JSON.stringify` automatically calls `Date.toJSON()` which returns an ISO 8601 string. No manual `.toISOString()` needed in the response pipeline.

---

## Zod Validation Conventions

### Schema Categories

| Category | Purpose | Date/Time Pattern |
|----------|---------|-------------------|
| **Input** (create/update body) | Validate JSON from client | `z.iso.datetime()` or `z.iso.date()` |
| **Response** (API output) | Type-check service return | `z.date()` |
| **Query** (URL params) | Coerce strings to types | `z.coerce.date()` |
| **Params** (URL path) | Validate path params | `z.uuid()` |

### Naming Conventions

```typescript
// Input schemas: create/update prefix
const createMatterSchema = z.object({ ... });
const updateMatterSchema = z.object({ ... });

// Response schemas: entity name
const matterSchema = z.object({ ... }).openapi('Matter');

// Query schemas: list prefix + Query suffix
const listMattersQuerySchema = z.object({ ... });

// Param schemas: entity + Params suffix
const matterIdParamSchema = z.object({ ... });
```

---

## Service Layer Conventions

### Date Handling in Services

```typescript
// Converting input string to Date for DB insert
open_date: matterData.open_date ? new Date(matterData.open_date) : undefined,

// Passing Drizzle Date output directly to response (NO .toISOString())
return result.ok({
  ...matter,
  deleted_at: matter.deleted_at ?? null,  // Date | null, not string
  created_at: matter.created_at,          // Date, not string
});

// Date comparison: use .getTime(), not .toISOString()
if (entry.start_time.getTime() !== newStartTime.getTime()) {
  changedFields.push('start_time');
}

// Nullable normalization: use ?? not ||
triage_decided_at: intake.triage_decided_at ?? null,   // correct
// triage_decided_at: intake.triage_decided_at || null, // WRONG: masks falsy-but-valid values
```

### Result Utility Pattern

```typescript
// Standard #6: Use result utilities
return result.ok(data);
return result.notFound('Resource not found');
return result.badRequest('Invalid input');
return result.internalError('Unexpected error');
```

---

## Stripe Integration Conventions

### Stripe Timestamps

Stripe uses Unix timestamps (seconds since epoch). Use the centralized utility:

```typescript
import { fromStripeTimestamp } from '@/shared/utils/timestamps';

// Convert Stripe unix timestamp to Date
const createdAt = fromStripeTimestamp(stripeObject.created);
```

### Stripe Metadata

Stripe metadata values MUST be strings. `.toISOString()` is correct here:

```typescript
metadata: {
  attached_at: new Date().toISOString(),  // correct for Stripe metadata
  auto_attached: 'true',                   // string, not boolean
}
```

### Event Payloads (JSONB)

Event payloads are stored as JSONB. ISO strings are acceptable:

```typescript
await SomeEvent.dispatch({
  created_at: new Date().toISOString(),  // acceptable for event payloads
  // OR
  created_at: new Date(),                // also fine, JSON.stringify handles it
});
```

---

## General Patterns

### Amounts

All monetary amounts stored in **cents** (integers, never floats):

```typescript
amount: z.number().int().min(0),  // in cents
// $10.00 = 1000 cents
```

### Nullable vs Optional

- `nullable()` = field present but can be null (DB columns that allow NULL)
- `optional()` = field may be omitted entirely (optional input fields)
- Response schemas should match DB nullability (use `.nullable()` for nullable columns)

### Error Handling

```typescript
// Log with structured context
logger.error('Failed to create matter {organizationId}: {error}', {
  organizationId,
  error: message,
});

// Return typed errors
return result.internalError(message);
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Correct Pattern |
|---|---|
| `.toISOString()` in response pipeline | Pass raw Date objects |
| `z.date()` for input validation | `z.iso.datetime()` or `z.iso.date()` |
| `z.coerce.date()` for JSON body input | `z.iso.datetime()` or `z.iso.date()` |
| `z.iso.datetime()` for response schema | `z.date()` |
| `\|\| null` for nullable timestamps | `?? null` |
| `new Date(unix * 1000)` inline | `fromStripeTimestamp(unix)` |
| `as SomeType` type assertions | Proper typing or validation |
| Amounts as floats/dollars | Integer cents |

---

## References

- [Drizzle ORM Timestamp Docs](https://orm.drizzle.team/docs/column-types/pg#timestamp)
- [Zod ISO Validation](https://zod.dev/?id=iso-datetimes)
- [Stripe API Conventions](https://stripe.com/docs/api)
- [build-architecture.md](./build-architecture.md) - Build & module system
