# Ideal Architecture for Blawby Backend

## System Overview - Detailed Layers

```
BLAWBY-TS IDEAL ARCHITECTURE - DETAILED

┌─────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SYSTEMS                           │
├──────────────┬──────────────┬──────────────┬───────────┬────────────┤
│  Stripe API  │ Email Service│ PostgreSQL   │Queue Worker│  Users    │
│  Webhooks    │              │ Event Store  │ Graphile   │(Lawyer+   │
│              │              │              │            │ Client)   │
└──────────────┴──────────────┴──────────────┴───────────┴────────────┘
                                    │
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│    HTTP API LAYER: Auth Middleware → Validation → Handlers         │
│              → Services → Domain Logic → Repositories               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
        ┌───────────▼────────────┐      ┌──────────▼────────────┐
        │  LAYER 1: INPUT DOMAINS│      │                       │
        ├────────────────────────┤      │                       │
        │ Practice Agent         │      │   Client Agent        │
        │ • Users               │      │   • Clients           │
        │ • Staff & Roles       │      │   • Intakes           │
        │ • Settings            │      │   • Contact Info      │
        └────────────────────────┘      └───────────────────────┘
                    │                               │
        ┌───────────▼────────────┐      ┌──────────▼────────────┐
        │  LAYER 2: TRACKING     │      │                       │
        ├────────────────────────┤      │                       │
        │ Matter Agent           │      │  Time & Expense       │
        │ • Cases               │      │  • Time Entries       │
        │ • Phases              │      │  • Expenses           │
        │ • Milestones          │      │  • Line Items         │
        └────────────────────────┘      └───────────────────────┘
                    │                               │
        ┌───────────┴───────────────────────────────┘
                    │
        ┌───────────▼────────────┐
        │   LAYER 3: BILLING     │
        ├────────────────────────┤
        │ Billing Module         │
        │ • Invoice Creation     │
        │ • Line Composition     │
        │ • Payment Links        │
        └────────────────────────┘
                    │
        ┌───────────▼────────────┐
        │ LAYER 4: FINANCIAL     │
        │      PROCESSING        │
        ├────────────────────────┤
        │ Payment Processor      │  Fund Management    Refund Engine
        │ • Intent Orchestration │  • Fund Routing     • State Machine
        │ • Customer Mgmt        │  • Transfer Exec.   • Reconciliation
        └────────────────────────┘
                    │
        ┌───────────▼────────────┐
        │ LAYER 5: PLATFORM      │
        │   INTEGRATION          │
        ├────────────────────────┤
        │ Stripe Integration     │  Subscriptions
        │ • API Adapter          │  • Plans
        │ • Webhook Router       │  • Metering
        │                        │  • Billing Periods
        └────────────────────────┘
                    │
        ┌───────────▼────────────┐
        │    CROSS-CUTTING       │
        │     CONCERNS           │
        ├────────────────────────┤
        │ • Authorization        │
        │   (CASL Abilities)     │
        │ • Event Bus            │
        │   (Outbox Pattern)     │
        │ • Error Handling       │
        │   (Discriminated Union)│
        │ • Audit & Logging      │
        │   (ISO14 Compliance)   │
        └────────────────────────┘
```

---

## Architecture Principles

// Services with business logic (50-200 lines)
const createInvoice = async ({ data }, ctx) => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Invoice');

  if (!data.number) {
    throw createValidationError('INVOICE_NUMBER_REQUIRED', 'Invoice number required');
  }

  const [invoice] = await ctx.db.insert(invoices).values({...}).returning();
  await ctx.emit(InvoiceCreated, {...});
  return invoice;
};

// Repositories (data access queries)
const createInvoice = async (data, executor) => {
  const [invoice] = await executor.insert(invoices).values(data).returning();
  return invoice;
};
```

**Benefits:**
- Clear separation of concerns
- Easy to test (each layer is testable)
- Unidirectional dependencies (no circular imports)

---

### 2. **Transaction Ownership (Handlers Only)**

Handlers open and control transaction scope. Services never open transactions.

```typescript
// Handler owns transaction
const createInvoiceHandler = async (c) => {
  const ctx = getServiceContext(c);

  const result = await db.transaction(async (tx) => {
    const txCtx = createServiceContext(ctx, tx);
    return await invoiceService.createInvoice({ data }, txCtx);
  });

  return c.json(result);
};

// Service receives executor (db or tx), doesn't care which
const createInvoice = async ({ data }, ctx) => {
  // ctx.db could be db or tx (service is unaware)
  const [invoice] = await ctx.db.insert(invoices).values({...}).returning();
  await ctx.emit(InvoiceCreated, {...});
  return invoice;
};
```

**Benefits:**
- Clear ownership
- Atomicity guarantees
- Services remain transaction-unaware
- Easy to test (pass db or tx)

---

### 3. **Throw-Based Error Handling**

Services throw. Handlers don't catch. Global errorHandler catches all.

**Current standard:**
```typescript
// Services throw directly
throw new HTTPException(400, { message: 'Only draft invoices can be sent' });
throw new HTTPException(404, { message: 'Invoice not found' });

// Handlers never catch or handle errors
const sendInvoiceHandler = async (c) => {
  const result = await service.sendInvoice({ id }, ctx);  // throws if error
  return c.json(result);
};
```

**Migration status:** Complete. Current `src/` and `test/` have no legacy service response wrapper matches.

**Error Types (Functional Discriminated Unions):**
```typescript
type AppError =
  | { kind: 'validation_error'; code: string; message: string; context: Record<string, unknown> }
  | { kind: 'app_error'; code: string; status: number; message: string; context: Record<string, unknown>; cause?: Error }
  | { kind: 'transaction_error'; code: string; message: string; context: Record<string, unknown>; cause?: Error }
  | { kind: 'authorization_error'; code: string; message: string; context: Record<string, unknown> };
```

**Benefits:**
- No error classes (simpler, more functional)
- Full cause chains in logs
- Structured context for every error
- Type-safe error handling
- Consistent across all modules

---

### 4. **ServiceContext Pattern**

Single context object passed to all services. No manual parameter extraction.

```typescript
interface ServiceContext {
  userId: string;
  organizationId: string;
  ability: AbilityType;            // CASL authorization
  db: Database | Transaction;       // Could be either, service doesn't care
  emit(event, payload): Promise<void>;
  memberRole?: string;
  matterId?: string;
}

// Always extracted via getServiceContext(c)
const ctx = getServiceContext(c);
```

**Benefits:**
- Single injection point
- Consistent across all handlers
- Easy to add new context (matterId, memberRole, etc)
- Type-safe

---

### 5. **Deep Modules (Small Interface, Large Implementation)**

Group related operations under single service export. Don't expose every function.

**Current (Invoices):**
```typescript
// Grouped services - deep modules
export const invoiceService = {
  createInvoice,      // 50-100 lines
  updateInvoice,      // 50-100 lines
  deleteInvoice,      // 50-100 lines
};

export const invoiceStripeCoordinationService = {
  sendInvoice,        // 50-100 lines
  syncInvoice,        // 50-100 lines
  voidInvoice,        // 50-100 lines
};

export const invoiceQueriesService = {
  listInvoices,       // 30 lines
  getInvoiceById,     // 30 lines
};
```

**Benefits:**
- Easier to test (mock fewer functions)
- Clear boundaries
- Related logic stays together
- High cognitive leverage (remember 2-3 functions per service)

---

### 6. **Event System (Transactional Outbox)**

Events emitted within transaction only. No event emissions outside transaction scope.

```typescript
const createInvoice = async ({ data }, ctx) => {
  return await ctx.db.transaction(async (tx) => {
    const [invoice] = await tx.insert(invoices).values({...}).returning();

    // Event emitted within transaction
    await ctx.emit(InvoiceCreated, { invoice_id: invoice.id }, { tx });

    return invoice; // Commit happens after this line
  });
};
```

**Benefits:**
- Atomicity: DB writes and events succeed/fail together
- No "action succeeded but webhook didn't" scenarios
- Webhook handlers see consistent state
- Retries are safe (idempotent operations)

---

### 7. **Structured Logging**

Every error includes full context (codes, IDs, cause chains) for debugging.

```typescript
// Every error has structured context
throw createTransactionError(
  'INVOICE_CREATION_FAILED',
  'Failed to create invoice',
  {
    invoiceId: id,
    organizationId: ctx.organizationId,
    clientId: client_id,
    matterId: matter_id,
  },
  originalError  // cause chain preserved
);

// Global errorHandler logs appropriately:
// - 4xx errors: log code, message (safe for clients)
// - 5xx errors: log full cause chain, stack trace (debugging)
```

**Benefits:**
- Debugging requires only logs + context
- No need to check database + Stripe API separately
- Error codes for monitoring/alerting
- Full cause chains for root cause analysis

---

## Implementation Status (As of 2026-03-31)

### ✅ Completed
1. **Error Handling** — All active modules use throw-based service/handler error handling.

### 🚨 Handler Response Pattern Inconsistency
**Current state**: Handlers call services directly and return `c.json(...)` or `c.body(...)`. Service failures propagate to middleware.

---

## Architectural Friction Points (Refactoring Opportunities)

### 🔴 Critical Issue: Error Handling Inconsistency
**Impact**: HIGH — Affects all modules, prevents global error middleware
- **Status**: Resolved. Keep new and touched code throw-based.

### 🟠 Trust Service Over-Exposure
**Impact**: HIGH — Complex, hard to test, tightly coupled
- **Current interface** (8 public functions):
  - recordDeposit, recordWithdrawal (primitives)
  - manualDeposit, manualWithdrawal (business logic)
  - getTransactions, getBalance, getBalanceWithTx, getReport (queries)
  - Plus internal helpers: `withTrustLock()`, `syncBalanceAndCheckThreshold()`
- **Problems**:
  - Exports internal locking logic to callers
  - Mixes advisorylock pattern with business logic
  - Imports mattersQueries to sync retainer_balance + emit events
  - 8 entry points = 8 test scenarios
- **Opportunity**: Deep module wrapper that hides locking, exposes only 2-3 public operations (manualDeposit, manualWithdrawal, getBalance)

### 🟠 Invoice Services Over-Specialization (Shallow Modules)
**Impact**: HIGH — 11 service files in `/invoices/services/`, each ~50-100 lines
- **Current split**:
  - `invoice-creation.service` (100+ lines, imports 6+ modules)
  - `invoice-lifecycle.service` (state machine logic)
  - `invoice-stripe-coordination.service` (sync to Stripe)
  - `fund-router.service`, `refund-reconciliation.service`, `invoice-webhooks.service`, etc.
- **Problems**:
  - Each file is an entry point; handlers import 4-6 services per operation
  - Public interface ≈ implementation size (shallow module anti-pattern)
  - Callers must know which service does what
- **Opportunity**: Group by workflow (creation, lifecycle, payments) into 2-3 deep modules with clear boundaries

### 🟡 Invoice Creation Validation Fragmentation
**Impact**: MEDIUM — Creates test setup complexity, cross-domain coupling
- **Current flow**: CreateInvoice requires 6+ validation steps:
  1. Resolve client (via invoiceClientResolver → clientsRepository + mattersQueries)
  2. Validate connected account (via invoiceValidators → onboarding state)
  3. Validate matter belongs to client (mattersQueries)
  4. Validate practice service (practiceServicesRepository)
  5. Calculate totals (calculateInvoiceTotals)
  6. Determine fund destination (getFundDestination)
- **Problems**: Validation scattered across 4 modules + main service logic
- **Opportunity**: Validation orchestrator that encapsulates dependency chain

### 🟡 Cross-Module Query Access (Data Access Coupling)
**Impact**: MEDIUM — Makes services hard to test in isolation
- **Examples**:
  - `invoices` imports mattersQueries, clientsRepository, practiceServicesRepository
  - `trust` imports mattersQueries to sync balances
  - All modules import domain query modules for validation
- **Problem**: Service business logic can't be unit tested without mocking 3+ repository modules
- **Opportunity**: Extract validation queries into a shared validation layer, or use a repository injection pattern

---

## Deep Module Principle Application

**John Ousterhout's definition**: A module is deep if it has a **small interface hiding a large, complex implementation**.

### Current Violations:
- Trust service: Interface ≈ implementation (8 exposed functions + internal helpers)
- Invoice services: Interface ≈ implementation (11 files, 50-100 lines each)
- Validation chain: Each step is a separate function/service

### Target State:
- Trust service: 2-3 public methods (manualDeposit, manualWithdrawal, getBalance) hiding locking, syncing, threshold checks
- Invoice services: 3-4 workflow-based operations hiding 11 current services
- Validation: Single orchestrator hiding 6 validation steps

---

## Phase 1: Error Handling Migration (BLOCKING - Do First)

**Goal**: Maintain throw-based service/handler error handling across all modules.

### Per-Module Migration Steps:

1. **Use direct throws:** Use `HTTPException` for expected HTTP failures and raw `Error` for unexpected worker/webhook failures.
   ```typescript
   throw new HTTPException(404, { message: 'Resource not found' });
   ```

2. **Replace Result returns with throws:**
   ```typescript
   // ❌ Old
   return badRequest('Invoice not found');

   // ✅ New
   throw createValidationError('INVOICE_NOT_FOUND', 'Invoice not found', { invoiceId });
   ```

3. **Remove Result type from service signatures:**
   ```typescript
   // ❌ Old
   const createInvoice = async (...): Promise<Result<Invoice>> => {
     if (!something) return badRequest('...');
     return ok(invoice);
   };

   // ✅ New
   const createInvoice = async (...): Promise<Invoice> => {
     if (!something) throw createValidationError('...', '...', {...});
     return invoice;
   };
   ```

4. **Remove Result checks in handlers:**
   ```typescript
   // ❌ Old
   const result = await service.create({...});
   if (!result.success) return c.json(result.error, result.error.status);
   return c.json(result.data);

   // ✅ New
   const data = await service.create({...});  // throws if error
   return c.json(data);
   ```

5. **Update event listeners:**
   - Ensure event handlers also use throw-based errors
   - Keep transactional context consistent

6. **Verify error codes are specific:**
   - Use codes like `INVOICE_NOT_FOUND`, not generic `NOT_FOUND`
   - Enables error monitoring and debugging

### Modules to Migrate (Priority Order):
1. **Trust** — High volume, critical path (retainer + refund flows)
2. **Subscriptions** — Medium complexity, isolated
3. **Uploads** — Small, no cross-domain dependencies
4. **Matters** — Large, many sub-resources, but well-scoped
5. **Practice-Client-Intakes** — Medium, depends on invoices (should be after)
6. **Onboarding** — Medium, depends on subscriptions (should be after)
7. **Invoices (Refund Requests)** — Last, since it's already partially throw-based

---

## Phase 2: Deep Module Refactoring (After Phase 1)

### 2.1 Trust Service Deepening
**Objective**: Hide locking logic, reduce public interface from 8 to 3 functions
- **What to hide**: `withTrustLock()`, advisory lock management, syncBalanceAndCheckThreshold
- **What to expose**: `manualDeposit()`, `manualWithdrawal()`, `getBalance()`
- **Internal helpers for callers**: `recordDeposit()`, `recordWithdrawal()` become private

### 2.2 Invoice Services Consolidation
**Objective**: Group 11 files into 2-3 workflow-based services
- **Service 1: InvoiceCreationWorkflow** — Hides invoice-creation, validation, fund-destination logic
- **Service 2: InvoiceLifecycleWorkflow** — Hides state machine, sync to Stripe, webhooks
- **Service 3: InvoicePaymentsWorkflow** — Hides refunds, reconciliation, payment intents

### 2.3 Validation Orchestration
**Objective**: Encapsulate invoice creation validation chain
- Hide: 6 validation steps, mattersQueries imports, clientsRepository imports
- Expose: Single `validateInvoiceContext()` method returning validated data

---

## Migration Priority & Timeline

| Phase | Module | Complexity | Est. Days | Blocker? |
|-------|--------|-----------|-----------|----------|
| 1 | Error Handling (all modules) | HIGH | 5-7 | YES - blocks error middleware |
| 2 | Trust deepening | MEDIUM | 2-3 | NO - improves testability |
| 2 | Invoices consolidation | MEDIUM | 3-4 | NO - improves maintainability |
| 2 | Validation orchestration | LOW | 1-2 | NO - improves testability |

---

## Key Benefits

- **Type Safety**: No `any`, discriminated unions, compile-time error checking
- **Testability**: Services are functions, easy to test in isolation with db/tx injection
- **Debuggability**: Structured errors with full context, cause chains, and error codes
- **Maintainability**: Clear boundaries, unidirectional dependencies, grouped services
- **Consistency**: Same patterns across all modules
- **Atomicity**: Transactions owned by handlers, events guaranteed within tx scope
- **Logging**: Full context captured automatically, no manual context propagation
- **AI Navigability**: Deep modules with small interfaces are easier for AI to understand and modify
- **Reduced Cognitive Load**: Developers remember 2-3 entry points per service, not 11 files

## Current Gaps (Blocking Full Benefits)

1. **Error Handling**: Resolved. Preserve the throw-based standard in new and touched code.

2. **Services Not Deep Enough**: Shallow public interfaces (8-11 entry points per "service")
   - **Effect**: Testing requires mocking complex dependency chains; "service" ≈ implementation
   - **Cost**: High test setup overhead, harder for AI to understand call graphs

3. **Cross-Module Query Coupling**: Business logic services import repository modules for validation
   - **Effect**: Can't unit test services without mocking 3+ repositories
   - **Cost**: Tests are slow, fragile, don't catch real bugs (mock divergence from production)

These gaps will be closed by **Phase 1 (Error Handling)** and **Phase 2 (Deep Modules)**.
