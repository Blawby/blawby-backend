---
description: Code Quality Standards (Gold Standard) for Blawby Backend
globs: ["src/**/*.ts"]
---

# Gold Standard Coding Standards

Follow these established patterns for all module implementations in the Blawby backend.
**Use sequential thinking before implementing any pattern below** — verify it matches the actual codebase first.

## 1. Service Pattern

Functions are defined as separate `const` arrow expressions, then exported via a single object. Services return data directly or throw `HTTPException` for expected failures.

```typescript
// ✅ CORRECT — from src/modules/matters/services/matters.service.ts
const createMatter = async (
  { data }: { data: CreateMatterRequest },
  ctx: ServiceContext,
): Promise<MatterRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Matter');

  return await db.transaction(async (tx) => {
    const [newMatter] = await tx.insert(matters).values({...}).returning();
    if (!newMatter) {
      throw new HTTPException(500, { message: 'Failed to create matter' });
    }
    await ctx.emit(MatterCreated, {...}, tx);
    return newMatter;
  });
};

const listMatters = async (
  filters: ListMattersQuery,
  ctx: ServiceContext,
): Promise<{ data: MatterRecord[], pagination: PaginationInfo }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  // ... business logic, throw HTTPException on expected failures
  return { data: matters, pagination };
};

export const mattersService = {
  createMatter,
  listMatters,
};

// ❌ INCORRECT — returning Result<T>, object method shorthand, or async function declarations
const createMatter = async (data): Promise<Result<MatterRecord>> => { ... };  // WRONG
export const mattersService = {
  async createMatter(data) { ... },  // WRONG
};
```

**Rules:**
- Max 2 parameters: `(params, ctx)` where params is an object and ctx is ServiceContext
- Return data directly — do NOT return `Result<T>` objects
- Throw `HTTPException` for expected failures (404, 400, 401, 409, 422)
- Throw raw `Error` for unexpected failures (500) or webhook/worker contexts
- Max ~200 lines per file, ~50 lines per function

## 2. Handler Pattern

Handlers are thin (3-8 lines) — extract validated data, call service, return response using `c.json()`. Services throw for errors.

```typescript
// ✅ CORRECT — from src/modules/matters/handlers.ts
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const createMatterHandler: AppRouteHandler<typeof routes.createMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');

  const matter = await mattersService.createMatter({ data: body }, ctx); // throws on error
  return c.json(matter, 201);
};

const getMattersHandler: AppRouteHandler<typeof routes.getMattersRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const response = await mattersService.listMatters(query, ctx);
  return c.json(response);
};

// Export as single object:
export const handlers = {
  createMatterHandler,
  getMattersHandler,
  // ...
};
```

**Rules:**
- Never use `response.fromResult()` — use Hono's native `c.json()`
- Use `getServiceContext(c)` — never manually extract user/orgId
- Never write `if (!user) return ...` — middleware handles auth
- Pass all service inputs as an object: `{ data: body, ...}`

## 3. Route Definition Pattern

Use `routeBuilder.build()` with OpenAPI schemas. Standard error responses are auto-included.

```typescript
// ✅ CORRECT — from src/modules/matters/routes/core.routes.ts
import { z } from '@hono/zod-openapi';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const createMatterRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/matters',
  tags,
  summary: 'Create a new matter',
  request: {
    params: z.object({
      practice_id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: createMatterRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Matter created successfully',
      content: {
        'application/json': {
          schema: matterResponseSchema,
        },
      },
    },
  },
});
// Standard error responses (400, 401, 403, 404, 500) are auto-included by routeBuilder
```

### Route Path Conventions

| Action     | Method   | Path Pattern                              |
|------------|----------|-------------------------------------------|
| **List**   | `GET`    | `/{practice_id}/<resource>`               |
| **Create** | `POST`   | `/{practice_id}/<resource>`               |
| **Get**    | `GET`    | `/{practice_id}/<resource>/{id}`          |
| **Update** | `PUT`    | `/{practice_id}/<resource>/{id}`          |
| **Delete** | `DELETE` | `/{practice_id}/<resource>/{id}`          |

Sub-resources nest under the parent: `/{practice_id}/matters/{id}/notes/{note_id}`

### Route Index File

All routes are re-exported from `routes/index.ts` as a single `routes` object:
```typescript
// src/modules/<module>/routes/index.ts
export const routes = {
  createMatterRoute,
  getMattersRoute,
  // ...all route exports
};
```

## 4. HTTP App Pattern (http.ts)

```typescript
// ✅ CORRECT — from src/modules/matters/http.ts
import { handlers } from '@/modules/matters/handlers';
import { routes } from '@/modules/matters/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';

const app = createHonoApp();

// Module-level middleware (if needed)
app.use('*', injectAbility());

// Register routes
app.openapi(routes.createMatterRoute, handlers.createMatterHandler);
app.openapi(routes.getMattersRoute, handlers.getMattersHandler);
// ...

export default app;
```

## 5. Module Entry Point (index.ts)

Minimal — just export the HTTP app:
```typescript
// ✅ CORRECT — from src/modules/matters/index.ts
import mattersApp from '@/modules/matters/http';
export default mattersApp;

// Optionally re-export types/schemas for cross-module use
export * from '@/modules/matters/types/matter.types';
export * from '@/modules/matters/database/schema/matters.schema';
```

## 6. Database Schema Pattern (Drizzle)

```typescript
// ✅ CORRECT — from src/modules/matters/database/schema/matters.schema.ts
import { relations } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';

export const matters = pgTable(
  'matters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id').notNull().references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    status: varchar('status', { length: 40 }).notNull().default('first_contact'),
    deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('matters_org_idx').on(table.organization_id),
    index('matters_status_idx').on(table.status),
  ],
);

export const mattersRelations = relations(matters, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [matters.organization_id],
    references: [organizations.id],
  }),
}));

// Type exports
export type InsertMatter = typeof matters.$inferInsert;
export type SelectMatter = typeof matters.$inferSelect;
```

## 7. Error Handling Pattern (Functional Discriminated Unions)

**NEW PATTERN (as of 2026-03):** Services throw structured, type-safe errors using factory functions. No error classes. Global handler provides context-aware logging.

### Core Types

Errors are discriminated unions defined in `src/shared/types/errors.ts`:

```typescript
// Type-safe error kinds with full context
export type AppError =
  | { kind: 'validation_error'; code: string; message: string; context: Record<string, unknown> }
  | { kind: 'authorization_error'; code: string; message: string; context: Record<string, unknown> }
  | { kind: 'app_error'; code: string; status: number; message: string; context: Record<string, unknown>; cause?: Error }
  | { kind: 'transaction_error'; code: string; message: string; context: Record<string, unknown>; cause?: Error };
```

### Factory Functions

Use these to create type-safe errors:

```typescript
import {
  createValidationError,   // 400-level validation failures
  createAppError,          // Any HTTP status (404, 409, 500, etc)
  createTransactionError,  // DB/TX failures with cause chain
  createAuthorizationError // 403 authorization failures
} from '@/shared/types/errors';

// ✅ Validation error (400)
if (!matter) {
  throw createValidationError(
    'MATTER_NOT_FOUND',     // Error code (searchable)
    'Matter not found',     // User-safe message
    { matterId: id }        // Debug context
  );
}

// ✅ Conflict (409) with extra context
if (existing.locked) {
  throw createAppError(
    'MATTER_LOCKED',
    409,                    // HTTP status
    'Matter is currently locked',
    { matterId: id, lockedAt: existing.locked_at }
  );
}

// ✅ Not found (404)
throw createAppError('MATTER_NOT_FOUND', 404, 'Matter not found', { matterId: id });

// ✅ Server error with cause chain (500)
try {
  await db.transaction(...);
} catch (error) {
  throw createTransactionError(
    'MATTER_CREATION_FAILED',
    'Failed to create matter',
    { matterId: id, organizationId: ctx.organizationId },
    error instanceof Error ? error : new Error(String(error))  // cause chain
  );
}

// ✅ Authorization (403)
throw createAuthorizationError(
  'MATTER_UPDATE_FORBIDDEN',
  'You do not have permission to update this matter',
  { matterId: id, ability: 'update' }
);
```

### Full Example: Matter Service

```typescript
import { createValidationError, createAppError, createTransactionError } from '@/shared/types/errors';
import { ForbiddenError } from '@casl/ability';

const createMatter = async (
  { data }: { data: CreateMatterRequest },
  ctx: ServiceContext
): Promise<MatterRecord> => {
  // CASL check first
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Matter');

  // Validation with context
  if (!data.title) {
    throw createValidationError(
      'MATTER_TITLE_REQUIRED',
      'Matter title is required'
    );
  }

  // Business logic validation
  if (data.billing_type === 'pro_bono' && !data.justification) {
    throw createValidationError(
      'PRO_BONO_JUSTIFICATION_REQUIRED',
      'Pro bono matters require a justification',
      { billingType: data.billing_type }
    );
  }

  // Transaction with proper error wrapping
  try {
    return await ctx.db.transaction(async (tx) => {
      const [newMatter] = await tx.insert(matters).values({
        organization_id: ctx.organizationId,
        title: data.title,
        billing_type: data.billing_type,
      }).returning();

      if (!newMatter) {
        throw createAppError(
          'MATTER_CREATION_FAILED',
          500,
          'Failed to create matter',
          { organizationId: ctx.organizationId }
        );
      }

      await ctx.emit(MatterCreated, { matter_id: newMatter.id }, tx);
      return newMatter;
    });
  } catch (error) {
    // Re-throw AppErrors as-is (already structured)
    if (error && typeof error === 'object' && 'kind' in error) {
      throw error;
    }
    // Wrap unexpected errors with full cause chain
    throw createTransactionError(
      'MATTER_CREATION_FAILED',
      'An unexpected error occurred while creating the matter',
      { organizationId: ctx.organizationId },
      error instanceof Error ? error : new Error(String(error))
    );
  }
};
```

### Global Error Handler Behavior

The handler at `src/shared/middleware/errorHandler.ts` automatically:
- Pattern-matches on error kind
- Logs at appropriate level (warn for 4xx, error for 5xx)
- Logs full cause chain for debugging (500 errors only)
- Returns structured JSON response with error code + message

**Client response (any error):**
```json
{
  "error": "MATTER_NOT_FOUND",
  "message": "Matter not found",
  "request_id": "uuid"
}
```

**Server logs (400 error):**
```json
{
  "level": "WARN",
  "code": "MATTER_NOT_FOUND",
  "message": "Matter not found",
  "context": { "matterId": "123" }
}
```

**Server logs (500 error):**
```json
{
  "level": "ERROR",
  "code": "MATTER_CREATION_FAILED",
  "message": "An unexpected error occurred while creating the matter",
  "context": { "organizationId": "456" },
  "cause": "UNIQUE constraint failed on title",
  "stack": "Error: ...\n  at createMatter..."
}
```

### Error Code Conventions

Use `SCREAMING_SNAKE_CASE` error codes:
- `RESOURCE_NOT_FOUND` — 404
- `INVALID_INPUT` — 400
- `DUPLICATE_RESOURCE` — 409
- `UNAUTHORIZED` — 401
- `FORBIDDEN` — 403
- `DB_TRANSACTION_FAILED` — 500
- `EXTERNAL_API_FAILED` — 502/503

Include resource type: `MATTER_NOT_FOUND`, `CLIENT_CREATION_FAILED`, `INVOICE_SYNC_FAILED`

### Migration Guide (HTTPException → Factory Functions)

| Old Pattern | New Pattern |
|---|---|
| `throw new HTTPException(404, { message: 'Not found' })` | `throw createAppError('CODE', 404, 'Not found', { context })` |
| `throw new HTTPException(400, { message: 'Bad input' })` | `throw createValidationError('CODE', 'Bad input', { context })` |
| `throw new Error(msg)` in tx | `throw createTransactionError('CODE', msg, { context }, error)` |

### Rules

✅ **DO:**
- Include error codes (searchable in logs)
- Include debug context (resource IDs, org IDs)
- Include cause chains for server errors
- Throw from services (let handler deal with it)
- Re-throw AppErrors as-is in catch blocks

❌ **DON'T:**
- Return `Result<T>` objects
- Throw custom error classes
- Log and throw (let handler log)
- Omit context from errors
- Mix old HTTPException with new factory functions

## 7b. Error Flow Architecture

Errors flow through a single pipeline — handlers never catch service errors:

```
Service (throws AppError or Error)
    ↓
Handler (passes through, doesn't catch)
    ↓
Hono middleware (catches all throws)
    ↓
Global errorHandler (errorHandler.ts)
    ├─→ Pattern match on error.kind
    ├─→ Log with context (code, message, context)
    ├─→ For 500: include cause chain (message + stack)
    └─→ Return structured JSON response
```

**IMPORTANT:** Handlers should **never** have try-catch blocks around service calls. Let Hono's global error handler deal with it.

```typescript
// ✅ CORRECT — service throws, handler doesn't catch
const createMatterHandler: AppRouteHandler<...> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');

  const matter = await mattersService.createMatter({ data: body }, ctx);  // throws
  return c.json(matter, 201);
};

// ❌ INCORRECT — handler shouldn't catch service errors
const createMatterHandler: AppRouteHandler<...> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');

  try {
    const matter = await mattersService.createMatter({ data: body }, ctx);
    return c.json(matter, 201);
  } catch (error) {  // ❌ DON'T DO THIS
    return c.json({ error: 'Failed' }, 500);
  }
};
```

The global handler ensures:
- Consistent error logging across all endpoints
- Full cause chains captured for debugging
- Safe message returned to client
- No accidental error swallowing

## 8. Validation Pattern (Zod + OpenAPI)

```typescript
// ✅ CORRECT
import { z } from '@hono/zod-openapi';  // NEVER from 'zod'

export const createMatterRequestSchema = z.object({
  title: z.string().min(1).max(255),
  billing_type: z.enum(['hourly', 'fixed', 'contingency', 'pro_bono']),
  open_date: z.iso.datetime().optional(),
  client_id: z.uuid().optional(),       // z.uuid(), NOT z.string().uuid()
}).openapi('CreateMatterRequest');

// Infer types from schemas
export type CreateMatterRequest = z.infer<typeof createMatterRequestSchema>;
```

## 9. Import & Path Pattern

```typescript
// ✅ CORRECT — always alias paths
import { mattersService } from '@/modules/matters/services/matters.service';
import { result } from '@/shared/utils/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { db } from '@/shared/database';
import { matters } from '@/modules/matters/database/schema/matters.schema';

// ❌ INCORRECT — relative paths
import { mattersService } from '../services/matters.service';  // NEVER
import { result } from '../../shared/utils/result';            // NEVER
```

## 10. Early Returns (Guard Clauses with Throws)

```typescript
// ✅ CORRECT
const processRequest = async (
  { data }: { data: Input },
  ctx: ServiceContext,
): Promise<Output> => {
  if (!data.id) {
    throw new HTTPException(400, { message: 'Missing ID' });
  }

  const existing = await repository.findById(data.id);
  if (!existing || existing.organization_id !== ctx.organizationId) {
    throw new HTTPException(404, { message: 'Resource not found' });
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', toSubject('Resource', existing));

  // ... proceed with business logic
  return updated;  // return data directly, no result.ok()
};
```

**Pattern:** Guard clauses at the top, throw immediately on validation failure, no `Result<T>` wrapper.

## 11. Event Listener Pattern

```typescript
// ✅ CORRECT — from src/modules/preferences/listeners.ts
import { getLogger } from '@logtape/logtape';
import { Event } from '@/shared/events/event';
import { AuthUserSignedUp } from '@/shared/events/definitions';

const logger = getLogger(['preferences', 'listeners']);

const registerPreferencesListeners = (): void => {
  Event.listen(AuthUserSignedUp, async (payload) => {
    const userId = payload.user_id;
    if (!userId) {
      logger.warn('Event missing user_id');
      return;
    }
    // ... handle event
  });
};

export { registerPreferencesListeners };
```

## 12. Error Handling Implementation Checklist

When rolling out error handling to a new module, follow this checklist:

### Step 1: Update Service Imports
```typescript
import {
  createValidationError,
  createAppError,
  createTransactionError,
  createAuthorizationError,
} from '@/shared/types/errors';
import { ForbiddenError } from '@casl/ability';
```

### Step 2: Replace HTTPException Throws

Search for `throw new HTTPException` in the service and replace:

```typescript
// OLD
throw new HTTPException(404, { message: 'Not found' });

// NEW
throw createAppError('RESOURCE_NOT_FOUND', 404, 'Resource not found', {
  resourceId: id,
  organizationId: ctx.organizationId,
});
```

### Step 3: Add Structured Context to Every Error

```typescript
// ❌ Minimal context
throw createValidationError('INVALID_INPUT', 'Input validation failed');

// ✅ Rich context (queryable in logs)
throw createValidationError('INVALID_INPUT', 'Input validation failed', {
  fieldName: 'email',
  providedValue: data.email,
  organizationId: ctx.organizationId,
});
```

### Step 4: Wrap Transaction Errors

```typescript
try {
  return await ctx.db.transaction(async (tx) => {
    // ... business logic
  });
} catch (error) {
  // Re-throw AppErrors as-is
  if (error && typeof error === 'object' && 'kind' in error) {
    throw error;
  }
  // Wrap unexpected errors
  throw createTransactionError(
    'OPERATION_FAILED',
    'Database transaction failed',
    { resourceId: id, organizationId: ctx.organizationId },
    error instanceof Error ? error : new Error(String(error))
  );
}
```

### Step 5: Add CASL Checks Early

```typescript
const updateResource = async (
  { id, data }: { id: string; data: UpdateRequest },
  ctx: ServiceContext
): Promise<Resource> => {
  // CASL check first
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Resource');

  // Then validation
  const existing = await repository.findById(id, ctx.organizationId);
  if (!existing) {
    throw createAppError('RESOURCE_NOT_FOUND', 404, 'Resource not found', { resourceId: id });
  }

  // Then business logic...
};
```

### Step 6: Test Error Cases

For each service function, test:
- ✅ Happy path (returns data)
- ❌ Validation errors (400-level)
- ❌ Not found (404)
- ❌ Forbidden (403)
- ❌ Conflict (409)
- ❌ Server errors (500)

Verify logs include error codes and context.

### Step 7: Verify with Handler

Handlers should be unchanged (just pass through). Verify:

```typescript
const handler: AppRouteHandler<...> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');

  const result = await service.create({ data: body }, ctx);  // NO TRY-CATCH
  return c.json(result, 201);
};
```

### Completion Checklist

- [ ] All `HTTPException` replaced with factory functions
- [ ] All errors include error codes
- [ ] All errors include debug context (IDs, org, etc)
- [ ] Transaction errors include cause chain
- [ ] CASL checks done first
- [ ] Handlers don't have try-catch
- [ ] TypeScript compiles without errors
- [ ] Formatting passes (`pnpm run format:check`)
- [ ] Error logs verified in local testing

## 13. Formatting Rules (ESLint)

- **Indent**: 2 spaces
- **Semicolons**: Always
- **Quotes**: Single quotes
- **Trailing commas**: Always in multiline
- **Max line length**: 120 characters
- **Import order**: builtin → external → internal → parent → sibling → index (alphabetized)
- **Brace style**: 1tbs (one true brace style)
- **Arrow parens**: Always required

Run `pnpm run format` to auto-fix. Run `pnpm run format:check` to verify.
