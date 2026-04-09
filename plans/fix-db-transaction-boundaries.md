# Fix: DB Transaction Boundaries - Complete Solution

**Status**: Foundation Phase (P0 - Critical)
**Date**: March 31, 2026
**Issue**: Database transaction ownership is scattered across layers, creating atomicity bugs, deadlock risk, and inconsistent state.
**Solution**: `db` in ServiceContext (APPROACH 2) — Handler opens transaction, injects executor into context, all services use it automatically.
**Principle**: Deep modules (Ousterhout) — services hide transaction complexity, handlers own boundaries.

---

## The Problem

Currently, `db` is passed to services or transactions are opened in services, creating:
- ❌ **Unclear ownership** — Who is responsible for committing?
- ❌ **Nested TX risk** — Service opens TX inside TX inside TX
- ❌ **Partial failures** — If event dispatch fails after invoice update, state is inconsistent
- ❌ **Hard to audit** — "Is this operation atomic?" requires reading code
- ❌ **Unmaintainable** — Moving code between services changes transaction behavior

**Example of Current Problems:**
```typescript
// Handler - unclear if TX is needed
const handler = async (c) => {
  const ctx = getServiceContext(c);
  const invoice = await invoiceService.createInvoice(data, ctx);
  return c.json(invoice, 201);
};

// Service - opens TX itself
const createInvoice = async (data, ctx) => {
  return await db.transaction(async (tx) => {
    const invoice = await invoicesRepository.create({...}, tx);
    await InvoiceCreated.dispatch({...}, {tx});
    return invoice;
  });
};

// Problem: If you call createInvoice from another service,
// do you get a NEW transaction? Or are you in an existing one?
// Inconsistent behavior, hard to compose multiple services atomically.
```

---

## The Solution: `db` in ServiceContext

**Core Idea**: Handler opens transaction and injects the executor (tx) into the context. Services use `ctx.db` which is automatically the transaction if in one.

### Architecture Flow

```
HTTP Handler (or Command/Job)
  ↓
  baseCtx = getServiceContext(c)  [baseCtx.db = db]
  ↓
  db.transaction(async (tx) => {
    ↓
    ctx = { ...baseCtx, db: tx }  [Inject tx into context]
    ↓
    service1(params, ctx)         [Uses ctx.db = tx]
    service2(params, ctx)         [Uses ctx.db = tx]
    repository.create(data, ctx.db) [All in same tx]
    ↓
  })                               [Commit or Rollback]
```

**Why This Works:**
- ✅ `db` and `tx` have identical interfaces in Drizzle
- ✅ Services don't know if they're in a transaction
- ✅ Handler controls whether operations are atomic
- ✅ Easy to test (inject mock db)
- ✅ Follows Deep Modules principle (hides complexity)

---

## Export Pattern (Single Object)

**Everything is exported as a single object constant with `as const`:**

```typescript
// ✅ CORRECT
export const handlers = {
  createInvoiceHandler,
  getInvoiceHandler,
  listInvoicesHandler,
} as const;

export const routes = {
  createInvoice,
  getInvoice,
  listInvoices,
} as const;

export const invoiceService = {
  createInvoice,
  findInvoice,
  updateStatus,
} as const;

export const invoicesRepository = {
  create,
  findById,
  updateStatus,
  delete,
} as const;
```

**Why:**
- ✅ Discoverable — IDE autocomplete shows all exports
- ✅ Type-safe — `as const` preserves individual function types
- ✅ Organized — Related functions grouped together
- ✅ Prevents export bloat — One import instead of many
- ✅ Easy to mock — Mock entire object in tests

**Usage:**
```typescript
// Single import
import { handlers } from '@/modules/invoices/handlers';
import { invoiceService } from '@/modules/invoices/services/invoice.service';

// Use
app.post('/invoices', handlers.createInvoiceHandler);
const invoice = await invoiceService.createInvoice({...}, ctx);
```

---

## Implementation

### Step 1: Update ServiceContext Type

```typescript
// src/shared/types/context.ts

import type { Database, Transaction } from 'drizzle-orm';

/**
 * Service execution context.
 *
 * Key: `db` is the database executor
 * - If handler opened transaction: db = tx (transaction instance)
 * - If handler didn't: db = db (database connection)
 * - In tests: db = mockDb
 *
 * Services use ctx.db without caring which it is.
 * Same interface, same behavior.
 */
export interface ServiceContext {
  userId: string;
  organizationId: string;
  ability: Ability;
  memberRole: string;
  matterId?: string;

  // ← The key: database executor in context
  // Type: Database | Transaction (both have insert/update/select/etc)
  db: ReturnType<typeof db.query | typeof tx.query>;

  emit: EventEmitter['emit'];
}

/**
 * Helper to create context with executor.
 */
export const createServiceContext = (
  baseCtx: Omit<ServiceContext, 'db'>,
  executor = db
): ServiceContext => ({
  ...baseCtx,
  db: executor,
});
```

### Step 2: Update getServiceContext in Middleware

```typescript
// src/shared/middleware/context.ts

import { getSessionUser } from '@better-auth/express';
import { db } from '@/shared/database';
import { createServiceContext } from '@/shared/types/context';

/**
 * Extract service context from HTTP request.
 * By default, ctx.db = db (not in transaction).
 * Handlers can inject tx if needed.
 */
export const getServiceContext = (c: Context): ServiceContext => {
  const user = getSessionUser(c);
  const organization = // ... load organization

  return createServiceContext({
    userId: user.id,
    organizationId: organization.id,
    ability: // ... build CASL ability
    memberRole: // ... load member role
  }, db); // ← Default executor is db, not in transaction
};
```

### Step 3: Handler Opens Transaction, Injects TX

```typescript
// src/modules/invoices/handlers.ts

import type { AppRouteHandler } from '@/shared/router/route-builder';
import { db } from '@/shared/database';
import { getServiceContext } from '@/shared/middleware/context';
import { createServiceContext } from '@/shared/types/context';
import { invoiceService } from '../services/invoice.service';
import { InvoiceCreated } from '@/shared/events/definitions';
import type { typeof routes } from './routes';

/**
 * Create invoice.
 * Handler OWNS the transaction boundary.
 */
const createInvoiceHandler: AppRouteHandler<typeof routes.createInvoice> =
  async (c) => {
    const baseCtx = getServiceContext(c);
    const body = c.req.valid('json');

    // ✅ Handler opens transaction
    const invoice = await db.transaction(async (tx) => {
      // ✅ Inject tx into context
      const ctx = createServiceContext(baseCtx, tx);

      // ✅ All service calls use tx automatically
      const created = await invoiceService.createInvoice(
        { data: body },
        ctx // ctx.db is now tx
      );

      // ✅ Events are persisted in same transaction
      await ctx.emit(InvoiceCreated, {
        invoice_id: created.id,
        organization_id: ctx.organizationId,
      });

      // ✅ Return actual data
      return created;
    });

    // ✅ Only return after transaction commits
    return c.json(invoice, 201);
  };

/**
 * Get invoice.
 */
const getInvoiceHandler: AppRouteHandler<typeof routes.getInvoice> = async (
  c
) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.param();

  // ✅ Read operations don't need transaction
  const invoice = await invoiceService.getInvoice({ id }, ctx);

  return c.json(invoice);
};

/**
 * Export all handlers as single object.
 * Pattern: handlers = { handlerName, ... } as const
 */
export const handlers = {
  createInvoiceHandler,
  getInvoiceHandler,
  // ... other handlers
} as const;
```

### Step 4: Service Uses `ctx.db` Without Knowing

```typescript
// src/modules/invoices/services/invoice.service.ts

import type { ServiceContext } from '@/shared/types/context';
import { HTTPException } from '@hono/hono';
import { invoicesRepository } from '../database/queries/invoices.queries';
import { ForbiddenError } from '@casl/ability';

/**
 * Create invoice.
 * Service doesn't know or care if it's in a transaction.
 * ctx.db is the executor (db or tx).
 */
const createInvoice = async (
  params: {
    readonly data: CreateInvoiceRequest;
  },
  ctx: ServiceContext
): Promise<InvoiceRecord> => {
  // Authorization
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Invoice');

  // Validation
  if (!params.data.matter_id) {
    throw new HTTPException(400, { message: 'Matter ID required' });
  }

  // Business logic - uses ctx.db (which is tx if in transaction)
  const invoice = await invoicesRepository.create(
    {
      id: generateId(),
      organization_id: ctx.organizationId,
      matter_id: params.data.matter_id,
      amount_cents: params.data.amount_cents,
      status: 'draft',
    },
    ctx.db // ← Pass executor
  );

  return invoice;
};

/**
 * Find invoice by ID.
 */
const findInvoice = async (
  params: { readonly id: string },
  ctx: ServiceContext
): Promise<InvoiceRecord> => {
  const invoice = await invoicesRepository.findById(params.id, ctx.db);

  if (!invoice) {
    throw new HTTPException(404, { message: 'Invoice not found' });
  }

  return invoice;
};

/**
 * Export all invoice services as single object.
 * Pattern: invoiceService = { serviceName, ... } as const
 */
export const invoiceService = {
  createInvoice,
  findInvoice,
  // ... other services
} as const;
```

### Step 5: Repository Accepts Executor Parameter

```typescript
// src/modules/invoices/database/queries/invoices.queries.ts

import type { SelectInvoice, InsertInvoice } from './invoices.schema';
import { db } from '@/shared/database';

/**
 * Invoices repository.
 * All methods accept optional executor parameter.
 *
 * Pattern: executor = executor || db
 * - If called from handler with tx: executor = tx
 * - If called from tests: executor = mockDb
 * - If called standalone: executor = db
 *
 * Single return statement at the end - clean, consistent pattern.
 */
export const invoicesRepository = {
  /**
   * Create invoice.
   *
   * @param data - Invoice data
   * @param executor - Database executor (db or tx)
   * @returns Created invoice
   * @throws Error if creation fails
   */
  create: async (
    data: InsertInvoice,
    executor = db
  ): Promise<SelectInvoice> => {
    const result = await executor
      .insert(invoices)
      .values(data)
      .returning();

    const invoice = result[0];

    if (!invoice) {
      throw new Error('Failed to create invoice');
    }

    return invoice;
  },

  /**
   * Find invoice by ID.
   *
   * @param id - Invoice ID
   * @param executor - Database executor (db or tx)
   * @returns Invoice or null
   */
  findById: async (
    id: string,
    executor = db
  ): Promise<SelectInvoice | null> => {
    const invoice = await executor.query.invoices.findFirst({
      where: (invoices, { eq }) => eq(invoices.id, id),
    });

    return invoice ?? null;
  },

  /**
   * Update invoice status.
   *
   * @param id - Invoice ID
   * @param status - New status
   * @param executor - Database executor (db or tx)
   * @returns Updated invoice
   * @throws Error if not found
   */
  updateStatus: async (
    id: string,
    status: SelectInvoice['status'],
    executor = db
  ): Promise<SelectInvoice> => {
    const result = await executor
      .update(invoices)
      .set({ status, updated_at: new Date() })
      .where((invoices, { eq }) => eq(invoices.id, id))
      .returning();

    const updated = result[0];

    if (!updated) {
      throw new Error('Invoice not found');
    }

    return updated;
  },

  /**
   * Delete invoice.
   *
   * @param id - Invoice ID
   * @param executor - Database executor (db or tx)
   * @returns true if deleted, false if not found
   */
  delete: async (
    id: string,
    executor = db
  ): Promise<boolean> => {
    const result = await executor
      .delete(invoices)
      .where((invoices, { eq }) => eq(invoices.id, id));

    return result.rowCount > 0;
  },
} as const;
```

### Step 6: Webhook Handler (Payment Processing)

```typescript
// src/modules/webhooks/handlers.ts

import { db } from '@/shared/database';
import { getServiceContext } from '@/shared/middleware/context';
import { createServiceContext } from '@/shared/types/context';
import { paymentService } from '@/modules/invoices/services/payment.service';
import { invoiceService } from '@/modules/invoices/services/invoice.service';
import { InvoicePaid } from '@/shared/events/definitions';

/**
 * Handle Stripe charge.succeeded webhook.
 * Critical atomicity requirement: invoice + transfer + event all or nothing.
 *
 * ✅ Handler owns transaction → all operations atomic
 */
const chargeSucceededHandler = async (c) => {
  const baseCtx = getServiceContext(c);
  const event = c.req.valid('json');

  // ✅ HANDLER OPENS TRANSACTION
  const result = await db.transaction(async (tx) => {
    const ctx = createServiceContext(baseCtx, tx);

    // Find invoice (in tx)
    const invoice = await invoiceService.findInvoice(
      { id: event.data.object.metadata?.invoice_id },
      ctx
    );

    if (!invoice) {
      throw new HTTPException(404, { message: 'Invoice not found' });
    }

    // Execute fund transfer (in same tx)
    const transfer = await paymentService.executePaymentTransfer(
      { invoice_id: invoice.id, amount_cents: event.data.object.amount },
      ctx
    );

    // Emit event (persisted in outbox table in same tx)
    // If this fails, entire tx rolls back → no partial state
    await ctx.emit(InvoicePaid, {
      invoice_id: invoice.id,
      organization_id: ctx.organizationId,
    });

    // ✅ Return actual result
    return {
      invoice,
      transfer,
    };
  });

  // ✅ Only return to Stripe after transaction commits
  return c.json(result, 200);
};

/**
 * Export all webhook handlers as single object.
 * Pattern: handlers = { handlerName, ... } as const
 */
export const handlers = {
  chargeSucceededHandler,
  chargeRefundedHandler,
  payoutPaidHandler,
  // ... other webhook handlers
} as const;
```

---

## Testing

### Unit Test (Service)

```typescript
// src/modules/invoices/__tests__/invoice.service.test.ts

import { test } from 'tap';
import { invoiceService } from '../services/invoice.service';
import { getMockServiceContext } from '@/shared/testing/mocks';

test('createInvoice returns invoice', async (t) => {
  const ctx = getMockServiceContext();

  const invoice = await invoiceService.createInvoice(
    { data: { matter_id: '123', amount_cents: 10000 } },
    ctx
  );

  t.ok(invoice.id);
  t.equal(invoice.amount_cents, 10000);
});
```

### Integration Test (Handler + Transaction)

```typescript
// src/modules/invoices/__tests__/charge-succeeded.test.ts

import { test } from 'tap';
import { db } from '@/shared/database';
import { chargeSucceededHandler } from '../handlers/charge-succeeded.handler';

test('charge.succeeded rolls back on failure', async (t) => {
  const invoiceId = 'test-invoice-123';

  // Simulate failure during processing
  try {
    await db.transaction(async (tx) => {
      const ctx = createServiceContext(baseCtx, tx);

      // Create invoice in tx
      const invoice = await invoiceService.createInvoice({...}, ctx);
      t.ok(invoice, 'Invoice created in tx');

      // Simulate failure
      throw new Error('Stripe API error');
    });
  } catch (e) {
    // Expected
  }

  // Verify rollback
  const invoice = await invoicesRepository.findById(invoiceId);
  t.notOk(invoice, 'Invoice rolled back after failure');
});
```

---

## Type Safety & Linting

### TypeScript Config (Strict)

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### ESLint Rules

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    // ❌ No db.transaction() calls in service files
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "CallExpression[callee.property.name='transaction'][callee.object.name='db']",
        message:
          'Only handlers can call db.transaction(). Services must accept ctx.db.',
      },
    ],

    // ✅ Require explicit return types
    '@typescript-eslint/explicit-function-return-types': 'error',

    // ✅ No implicit any
    '@typescript-eslint/no-explicit-any': 'error',
  },
};
```

---

## Validation Checklist

### Type Safety
- [ ] `pnpm run typecheck` passes with zero errors
- [ ] `pnpm run format:check` passes with zero errors
- [ ] All service methods have explicit return types
- [ ] All repository methods accept `executor = db` parameter
- [ ] ServiceContext.db is properly typed (Database | Transaction)

### Transaction Boundaries
- [ ] No `db.transaction()` calls in any service file
- [ ] All handlers that write data open a transaction
- [ ] Handler injects `tx` into context via `createServiceContext(baseCtx, tx)`
- [ ] Services use `ctx.db` (not `ctx.tx` or direct `db`)
- [ ] Repositories accept `executor = db` parameter

### Testing & Validation
- [ ] Unit tests pass (services called with context)
- [ ] Integration tests pass (handlers, transactions)
- [ ] Payment webhook test verifies atomicity (failure = full rollback)
- [ ] Refund flow tested for atomicity
- [ ] Linting rule enforces no service-level transactions
- [ ] No nested transaction errors in production logs

### Code Review Checklist
- [ ] Every service uses `ctx.db`, not direct db import
- [ ] Every repository method has `executor = db` parameter
- [ ] Every handler that writes opens `db.transaction()`
- [ ] Transaction context injected: `ctx = createServiceContext(baseCtx, tx)`
- [ ] Events emitted inside transaction: `await ctx.emit(...)`
- [ ] Handlers exported as single object: `export const handlers = { ... } as const`
- [ ] Services exported as single object: `export const invoiceService = { ... } as const`
- [ ] Repositories exported as single object: `export const invoicesRepository = { ... } as const`
- [ ] Routes exported as single object: `export const routes = { ... } as const`
- [ ] All objects use `as const` for type preservation

---

## Migration Strategy

### Phase 0: Error Handling Setup (2-3 hours)
1. Create `src/shared/types/errors.ts` with discriminated union types
2. Create factory functions: `createAppError()`, `createValidationError()`, `createTransactionError()`
3. Update `src/shared/middleware/errorHandler.ts` to:
   - Pattern match on error kind
   - Log full context + cause chain
   - Return safe messages to client
4. Update all services to throw using factory functions

### Phase 1: Update Types (2-3 hours)
1. Update `ServiceContext` to include `db` executor
2. Create `createServiceContext()` helper
3. Update `getServiceContext()` to return `db` as executor

### Phase 2: Update Handlers (4-6 hours)
1. Find all handler files
2. Wrap write operations in `db.transaction()`
3. Inject tx into context: `ctx = createServiceContext(baseCtx, tx)`
4. Pass `ctx` to service calls

### Phase 3: Update Services (6-8 hours)
1. Remove `db.transaction()` calls from services
2. Change services to use `ctx.db` instead of direct db
3. Update service signatures to accept `ctx: ServiceContext`
4. Update all throws to use factory functions with context

### Phase 4: Update Repositories (4-6 hours)
1. Add `executor = db` parameter to all repository methods
2. Change queries to use `executor` instead of `db`
3. Test with both db and tx executors

### Phase 5: Validation (2-3 hours)
1. Run typecheck
2. Run linter
3. Run all tests
4. Test error logging with actual failures
4. Code review

---

## Error Handling (Functional Pattern)

**Industry Standard**: Discriminated unions + factory functions (no classes)

### Error Types

```typescript
// src/shared/types/errors.ts

type AppError =
  | {
      kind: 'app_error';
      code: string;           // 'INVOICE_NOT_FOUND', 'DB_TRANSACTION_FAILED'
      status: number;         // HTTP status
      message: string;        // User-safe message
      context: Record<string, unknown>; // Debug context
      cause?: Error;          // Original error chain
    }
  | {
      kind: 'validation_error';
      code: string;
      message: string;
      context: Record<string, unknown>;
    }
  | {
      kind: 'transaction_error';
      code: string;
      message: string;
      context: Record<string, unknown>;
      cause?: Error;
    };

// Factory functions - no classes
export const createAppError = (
  code: string,
  status: number,
  message: string,
  context: Record<string, unknown> = {},
  cause?: Error
): AppError => ({
  kind: 'app_error',
  code,
  status,
  message,
  context,
  cause,
});

export const createValidationError = (
  code: string,
  message: string,
  context: Record<string, unknown> = {}
): AppError => ({
  kind: 'validation_error',
  code,
  message,
  context,
});

export const createTransactionError = (
  code: string,
  message: string,
  context: Record<string, unknown> = {},
  cause?: Error
): AppError => ({
  kind: 'transaction_error',
  code,
  message,
  context,
  cause,
});
```

### Services Throw with Full Context

```typescript
// src/modules/invoices/services/invoice.service.ts

const createInvoice = async (
  { data }: { data: CreateInvoiceRequest },
  ctx: ServiceContext
): Promise<InvoiceRecord> => {
  try {
    const invoice = await invoicesRepository.create(data, ctx.db);
    return invoice;
  } catch (error) {
    // Throw with code, message, context, and cause
    throw createAppError(
      'INVOICE_CREATION_FAILED',
      500,
      'Failed to persist invoice to database',
      {
        invoiceId: data.id,
        organizationId: ctx.organizationId,
        operation: 'createInvoice',
      },
      error instanceof Error ? error : undefined
    );
  }
};
```

### Error Handler with Pattern Matching

```typescript
// src/shared/middleware/errorHandler.ts

import type { AppError } from '@/shared/types/errors';

export const errorHandler: ErrorHandler = (error, c) => {
  const baseContext = {
    requestId: c.get('requestId'),
    userId: c.get('userId'),
    organizationId: c.get('organizationId'),
    url: c.req.url,
    method: c.req.method,
    timestamp: new Date().toISOString(),
  };

  // Pattern match on error type
  if (error instanceof Error && 'kind' in error) {
    const appError = error as AppError;

    switch (appError.kind) {
      case 'validation_error':
        logger.warn('Validation error', {
          ...baseContext,
          code: appError.code,
          message: appError.message,
          context: appError.context,
        });
        return c.json({
          error: appError.code,
          message: appError.message,
          request_id: baseContext.requestId,
        }, 400);

      case 'app_error':
        if (appError.status >= 500) {
          // Server errors: log full context + cause chain
          logger.error('Server error', {
            ...baseContext,
            code: appError.code,
            message: appError.message,
            context: appError.context,
            cause: appError.cause?.message,
            stack: appError.cause?.stack,
          });
        } else {
          // Client errors: log code only (safe)
          logger.warn('Client error', {
            ...baseContext,
            code: appError.code,
            message: appError.message,
          });
        }
        return c.json({
          error: appError.code,
          message: appError.message,
          request_id: baseContext.requestId,
        }, appError.status);

      case 'transaction_error':
        // Transaction failures: always log with cause
        logger.error('Transaction error', {
          ...baseContext,
          code: appError.code,
          message: appError.message,
          context: appError.context,
          cause: appError.cause?.message,
          stack: appError.cause?.stack,
        });
        return c.json({
          error: appError.code,
          message: 'Transaction failed',
          request_id: baseContext.requestId,
        }, 500);
    }
  }

  // Fallback for non-AppError
  logger.error('Unhandled error', {
    ...baseContext,
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
  });

  return c.json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    request_id: baseContext.requestId,
  }, 500);
};
```

### Key Principles for Error Handling

| Principle | Implementation |
|-----------|-----------------|
| **No Classes** | Use discriminated unions + factory functions |
| **Full Context** | code, message, context, cause all preserved |
| **Structured Logging** | JSON logs with context, not string interpolation |
| **Severity Based** | 500+ errors log stack; 4xx errors safe message only |
| **Cause Chain** | Original error accessible internally, safe message to client |
| **Audit Trail** | requestId ties all logs together for compliance |
| **Type Safe** | Discriminated unions prevent unhandled cases |

---

## Key Principles (All)

| Principle | Implementation |
|-----------|-----------------|
| **Single TX Owner** | Only handlers call `db.transaction()` |
| **Simple Interface** | Services just use `ctx.db`, no awareness of tx |
| **Same Executor** | `db` and `tx` have identical interface |
| **Atomicity Guaranteed** | Handler TX includes data + events |
| **Error Propagates** | Any error → rollback everything |
| **Deep Modules** | Services hide tx complexity |
| **Type Safe** | No `any` types, explicit everywhere |
| **Testable** | Inject mock db via context |
| **Return Real Data** | Handlers return actual entities (invoice, user), not `{ success: true }` |
| **Single Return** | Repository methods have single return statement at end |
| **Grouped Exports** | Handlers, services, routes, repositories exported as single object with `as const` |
| **Functional Errors** | Discriminated unions + factory functions, no classes |
| **Full Context Logging** | code, message, context, cause all logged for debugging |

---

## Summary

**Before**: Services open transactions, handler doesn't. Unclear scope, nested TX risk, hard to compose.

**After**: Handlers open transactions, inject executor into context. Services use `ctx.db`. Simple, atomic, composable.

**Result**: ✅ Clear ownership, ✅ Type-safe, ✅ Auditable, ✅ Testable, ✅ Deep modules
