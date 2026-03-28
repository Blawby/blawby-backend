# Hono Native Error Handling — Implementation Plan

## Overview

Migrate from the `Result<T>` wrapper pattern to Hono's native throw-based error handling. Services will throw `HTTPException` (or domain-specific exceptions that the global error handler knows how to handle), handlers will be thin and exception-free, and a single global `onError` handler will map all exceptions to HTTP responses.

**Benefits:**
- Handlers: zero error-handling boilerplate (no `if (!result.success)`)
- Services: return plain data (no wrapping)
- Stack traces: errors remain traceable via throw stack
- Consistency: aligns with Fastify, NestJS, Express, and Hono's own patterns
- Testing: standard `expect().toThrow()` instead of checking `.success` flag

---

## Scope: Files & Modules

### Phase 1: Foundation (Required before any service migration)

**Priority: CRITICAL**

| File | Action | Reason |
|------|--------|--------|
| `src/shared/middleware/errorHandler.ts` | Add `HTTPException` handler | Must exist before services throw it |
| `src/shared/utils/result.ts` | Keep (but mark deprecated) | May be referenced in imports; safe to leave |
| `src/shared/utils/responseUtils.ts` | Keep (but mark deprecated) | May be referenced in imports; safe to leave |

### Phase 2: Service Layer Migration (18 modules, 60+ services)

**Order:** Start with leaf dependencies (services with fewest internal dependencies), then work up.

#### Tier 1: Leaf Services (No internal service dependencies)
- `clients/services/` (7 files: clients-mutation, direct-creation, setup, stripe, creation, memos, intake-creation)
- `invoices/services/` (8 files)
- `matters/services/` (7 files)
- `practice/services/` (4 files)
- `preferences/services/` (1 file)
- `trust/services/` (1 file)
- `practice-client-intakes/services/` (5 files)

#### Tier 2: Services That Call Tier 1
- `subscriptions/services/` (3 files)
- `onboarding/services/` (2 files)
- `uploads/services/` (7 files)

#### Tier 3: Webhook Services (Job queue workers — special handling)
- `webhooks/services/` (3 files)
- `invoices/services/invoice-webhooks.service.ts`

### Phase 3: Handler Layer Migration (thin refactor)

**Order:** After all services are migrated

| Module | File | Changes |
|--------|------|---------|
| All modules | `handlers.ts`, `routes/*.routes.ts` | Remove `sendResult(c, result)` → use `c.json(data, 200)` |
| All modules | Remove try/catch blocks | Let exceptions bubble to global handler |

---

## Implementation Steps

### Step 1: Update Global Error Handler

**File:** `src/shared/middleware/errorHandler.ts`

```typescript
import { HTTPException } from 'hono/http-exception';
import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const logger = getLogger(['app', 'error-handler']);

export const errorHandler: ErrorHandler = (error, c) => {
  const requestId = c.get('requestId') || crypto.randomUUID();
  const startTime = c.get('startTime') ?? Date.now();
  const responseTime = Date.now() - startTime;

  // 1. Hono HTTPException — clean path for middleware/service errors
  if (error instanceof HTTPException) {
    logger.info('HTTP Exception: {status} {message}', {
      status: error.status,
      message: error.message,
      requestId,
      responseTime,
    });
    return c.json(
      {
        error: 'HTTP_ERROR',
        message: error.message,
        request_id: requestId,
      },
      error.status
    );
  }

  // 2. CASL authorization errors
  if (error instanceof ForbiddenError) {
    logger.warn('Access forbidden: {message}', {
      message: error.message,
      userId: c.get('userId'),
      organizationId: c.get('activeOrganizationId'),
      requestId,
      responseTime,
    });
    return c.json(
      {
        error: 'FORBIDDEN',
        message: error.message,
        request_id: requestId,
      },
      403
    );
  }

  // 3. Unexpected errors — always 500
  logger.error('Unhandled exception: {message} [{method} {url}]', {
    message: error instanceof Error ? error.message : 'Unknown error',
    method: c.req.method,
    url: c.req.url,
    requestId,
    responseTime,
    error,
    userId: c.get('userId'),
    organizationId: c.get('activeOrganizationId'),
  });

  return c.json(
    {
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      request_id: requestId,
    },
    500
  );
};
```

**Rationale:**
- HTTPException is Hono's standard exception for HTTP-aware code
- ForbiddenError (from CASL) is already being caught
- Everything else becomes 500 + logged as an unexpected error

---

### Step 2: Migrate Services (Module by Module)

#### Pattern: Service Migration

**Before (Result<T>):**
```typescript
const getMatter = async (id: string, ctx: ServiceContext): Promise<Result<MatterRecord>> => {
  const matter = await mattersRepository.findById(id);
  if (!matter) {
    return result.notFound('Matter not found');
  }
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Matter', matter));
  return result.ok(matter);
};
```

**After (Throw):**
```typescript
import { HTTPException } from 'hono/http-exception';

const getMatter = async (id: string, ctx: ServiceContext): Promise<MatterRecord> => {
  const matter = await mattersRepository.findById(id);
  if (!matter) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Matter', matter));
  return matter; // ← just the data
};
```

**Mapping Table: Result → HTTPException**

| Current | New |
|---------|-----|
| `result.notFound(msg)` | `throw new HTTPException(404, { message: msg })` |
| `result.badRequest(msg)` | `throw new HTTPException(400, { message: msg })` |
| `result.unauthorized(msg)` | `throw new HTTPException(401, { message: msg })` |
| `result.forbidden(msg)` | (Already handled by ForbiddenError) |
| `result.conflict(msg)` | `throw new HTTPException(409, { message: msg })` |
| `result.internalError(msg)` | `throw new Error(msg)` → caught as 500 |
| `result.unprocessable(msg)` | `throw new HTTPException(422, { message: msg })` |
| `return result.ok(data)` | `return data` |

**Special Cases:**

1. **Webhook services (job queue workers)** — These are NOT called by HTTP handlers. They're called by job queue workers.
   - Keep throwing raw `Error` — the job queue worker will catch and retry
   - OR migrate to throw HTTPException if they're also called from HTTP endpoints
   - Decision: Throw `new Error()` for now; they'll be caught by job queue, not HTTP

2. **Services with nested try/catch re-wrapping**
   - Remove the try/catch entirely
   - Let exceptions bubble to handlers and then to global error handler
   - Example: remove blocks like `catch (err) { throw new Error('Failed to...') }`

---

### Step 3: Migrate Handlers (Thin Layer)

#### Pattern: Handler Migration

**Before (Result<T>):**
```typescript
const getMatterHandler: AppRouteHandler<typeof matterRoutes.getMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  const result = await mattersService.getMatter(id, ctx);
  return response.fromResult(c, result);
};
```

**After (Throw):**
```typescript
const getMatterHandler: AppRouteHandler<typeof matterRoutes.getMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  const matter = await mattersService.getMatter(id, ctx); // throws on error
  return c.json({ matter }, 200);
};
```

**Changes in All Handlers:**
1. Remove `const result = await service.xxx()`
2. Replace with `const data = await service.xxx()`
3. Remove `return response.fromResult(c, result)`
4. Replace with `return c.json(data, 200)` or `return c.json({ key: data }, 201)`
5. No try/catch needed (unless you need to handle application-specific cleanup)

---

### Step 4: Identify and Fix Webhook Services

**Files:**
- `src/modules/invoices/services/invoice-webhooks.service.ts`
- `src/modules/webhooks/services/onboarding-webhooks.service.ts`
- `src/modules/webhooks/services/practice-client-intakes-webhooks.service.ts`
- `src/modules/webhooks/services/stripe-retries.service.ts`

**Decision:** These are called by Graphile Worker job queue, not HTTP handlers.
- Keep them throwing raw `Error` (job queue will retry on throw)
- No HTTPException needed
- No Result<T> wrapper needed
- They should just log errors clearly and let exceptions bubble

**Pattern for webhook services:**
```typescript
const handleInvoicePaid = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  // Do work...
  // If something fails, throw — the job queue will retry
  const hasRequiredFields = stripeInvoice.customer && stripeInvoice.lines?.data?.length > 0;
  if (!hasRequiredFields) {
    throw new Error(`Failed to process invoice ${stripeInvoice.id}: missing customer or line items`);
  }
};
```

---

## Detailed Module Migration Order

### Migration Sequence

```text
1. src/shared/middleware/errorHandler.ts                      [Phase 1]
   ↓
2. src/modules/clients/services/*                              [Phase 2, Tier 1]
3. src/modules/invoices/services/*                             [Phase 2, Tier 1]
4. src/modules/matters/services/*                              [Phase 2, Tier 1]
5. src/modules/practice/services/*                             [Phase 2, Tier 1]
6. src/modules/preferences/services/*                          [Phase 2, Tier 1]
7. src/modules/trust/services/*                                [Phase 2, Tier 1]
8. src/modules/practice-client-intakes/services/*              [Phase 2, Tier 1]
   ↓
9. src/modules/subscriptions/services/*                        [Phase 2, Tier 2]
10. src/modules/onboarding/services/*                          [Phase 2, Tier 2]
11. src/modules/uploads/services/*                             [Phase 2, Tier 2]
    ↓
12. src/modules/webhooks/services/* (job queue only)           [Phase 2, Tier 3]
    src/modules/invoices/services/invoice-webhooks.service.ts  [Phase 2, Tier 3]
    ↓
13. All handlers: clients/handlers.ts, matters/handlers.ts, etc [Phase 3]
```

---

## Files to Delete/Deprecate After Migration

Once all services are migrated to throw:

**The following files can be deleted:**
- `src/shared/utils/result.ts` — no longer used
- `src/shared/utils/responseUtils.ts` — no longer used

**Before deletion:**
1. Verify no imports remain in codebase (grep for `from '@/shared/utils/result'` and `from '@/shared/utils/responseUtils'`)
2. Update CLAUDE.md to remove mention of Result<T> pattern
3. Create a final commit documenting the removal

---

## Testing Strategy

### Unit Tests

**Before migration:**
```typescript
it('returns not found result when matter does not exist', async () => {
  const result = await mattersService.getMatter('nonexistent-id', ctx);
  expect(result.success).toBe(false);
  expect(result.error.status).toBe(404);
});
```

**After migration:**
```typescript
it('throws HTTPException with 404 when matter does not exist', async () => {
  await expect(mattersService.getMatter('nonexistent-id', ctx)).rejects.toThrow(HTTPException);
  try {
    await mattersService.getMatter('nonexistent-id', ctx);
  } catch (err) {
    if (err instanceof HTTPException) {
      expect(err.status).toBe(404);
    }
  }
});
```

### Integration Tests

Tests that call handlers don't need changes — the global error handler will catch exceptions and return HTTP responses as normal.

**Before:**
```typescript
const res = await app.request('/api/matters/123');
expect(res.status).toBe(404);
```

**After:** Same test, no changes needed (the error handler still returns 404)

---

## Rollout Strategy

1. **Phase 1:** Update errorHandler.ts only (commit 1)
   - All existing code continues to work
   - New exception handling ready

2. **Phase 2A:** Migrate leaf services (commits 2-N)
   - Leaf services → handlers (in same module) → still use Result<T>
   - No cross-module dependencies
   - Easy to test in isolation

3. **Phase 2B:** Migrate dependent services
   - These call Tier 1 services that now throw
   - Update to throw themselves

4. **Phase 3:** Migrate all handlers
   - Once all services throw, handlers become trivial
   - Remove `response.fromResult`, add `c.json`

5. **Cleanup:** Delete result.ts, responseUtils.ts

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Handlers don't catch exceptions | Error handler catches everything; handlers become thin |
| Breaking existing API contracts | HTTP status codes stay the same (HTTPException status arg) |
| Webhook workers fail silently | Already throwing — no change needed |
| Tests fail | Unit tests will need `expect().rejects.toThrow()`; integration tests unchanged |
| Third-party code expects Result<T> | Keep result.ts (unused but present) until sure |

---

## Success Criteria

- [ ] All services return plain data or throw HTTPException
- [ ] No handler has `sendResult(c, result)` remaining
- [ ] No handler has try/catch (except for resource cleanup)
- [ ] Global error handler catches HTTPException natively
- [ ] All tests pass
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run format:check` passes

---

## Commits (Per-Module)

Each module gets one clean commit:

```text
1. feat(middleware): add HTTPException handling to global error handler
2. refactor(clients): migrate services to throw HTTPException
3. refactor(clients): simplify handlers with throw pattern
4. refactor(invoices): migrate services to throw HTTPException
5. refactor(invoices): simplify handlers with throw pattern
... (repeat for each module)
```

Final cleanup commit:
```text
NNN. refactor(shared): remove deprecated Result<T> pattern (result.ts, responseUtils.ts)
```

