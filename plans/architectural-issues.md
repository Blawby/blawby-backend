# Architectural Issues & Resolutions

This document tracks architectural problems identified in Blawby and their resolutions.

---

## Issue #1: Mixed Error Handling Paradigms (Result<T> vs Throw-Based)

**Status**: ✅ PARTIALLY RESOLVED (Invoices done, 7 modules pending)

### Problem
Codebase uses both Result<T> and throw-based error handling:
- **Invoices module** (✅ done): Throw-based with factory functions
- **Refund requests**: Result<T> pattern
- **Matters**: Result<T> pattern
- **Trust**: Result<T> pattern
- **Uploads**: Result<T> pattern
- **Subscriptions**: Result<T> pattern
- **Practice-Client-Intakes**: Result<T> pattern
- **Onboarding**: Result<T> pattern

This creates:
- Inconsistent error handling across modules
- Mixed cognitive load (some throw, some return Result)
- No structured logging/context in Result<T> modules
- Verbose handler code checking `.success` flags
- Global error middleware can't work consistently

### Impact
- Developers must learn two patterns
- Integration tests harder (different error shapes)
- Debugging requires checking logs AND database state
- Error context (which resource, which org) is lost
- No error codes for monitoring/alerting in Result<T> modules

### Resolution
**Unified throw-based error handling with factory functions**

All modules follow the invoices pattern:

1. **Factory functions** (one-liner error creation):
```typescript
throw createValidationError('INVOICE_NOT_DRAFT', 'Only draft invoices can be sent', {
  invoiceId: id,
  currentStatus: invoice.status,
});
```

2. **Four error kinds** (discriminated unions):
```typescript
type AppError =
  | { kind: 'validation_error'; code: string; message: string; context: Record<string, unknown> }
  | { kind: 'app_error'; code: string; status: number; message: string; context: Record<string, unknown>; cause?: Error }
  | { kind: 'transaction_error'; code: string; message: string; context: Record<string, unknown>; cause?: Error }
  | { kind: 'authorization_error'; code: string; message: string; context: Record<string, unknown> };
```

3. **Global errorHandler pattern-matches** and logs appropriately:
   - 4xx errors: Log message only (safe for clients)
   - 5xx errors: Log full cause chain + context (debugging)

4. **Clean service signatures**:
```typescript
// Before (Result<T>)
const create = async (...): Promise<Result<Invoice>> => {
  if (!valid) return badRequest('Invalid');
  return ok(invoice);
};

// After (throw-based)
const create = async (...): Promise<Invoice> => {
  if (!valid) throw createValidationError('INVALID', 'Invalid');
  return invoice;
};
```

**Rollout Priority**: Trust → Subscriptions → Uploads → Matters → Practice-Client-Intakes → Onboarding → Invoices (Refund Requests)

---

## Issue #2: Transaction Boundaries Scattered

**Status**: ✅ RESOLVED (Invoices implemented)

### Problem
Unclear transaction ownership:
- Some services opened transactions (`db.transaction()`)
- Some expected transactions passed in
- Some ignored transaction state
- Event emissions could happen outside transaction scope

This created:
- Ambiguous atomicity guarantees
- Risks of partial updates on failure
- Events emitted but DB rolled back
- Hard to test transaction behavior

### Resolution
**Single source of transaction ownership: Handlers**

Handlers open transactions and inject them into ServiceContext.db:

```typescript
// Handler owns the transaction
const createInvoiceHandler = async (c) => {
  const ctx = getServiceContext(c);

  const result = await db.transaction(async (tx) => {
    const invoiceCtx = createServiceContext(ctx, tx);
    return await invoiceService.createInvoice({ data }, invoiceCtx);
  });

  return c.json(result, 201);
};

// Service never opens transactions
const createInvoice = async ({ data }, ctx) => {
  // ctx.db is either db or tx (service doesn't care)
  const [invoice] = await ctx.db.insert(invoices).values({...}).returning();

  // Events emitted within same transaction
  await ctx.emit(InvoiceCreated, { invoice_id: invoice.id });

  return invoice;
};
```

**Benefits:**
- Clear ownership and atomicity guarantees
- Services remain transaction-unaware and easier to test
- No nested transaction risks
- Events guaranteed to succeed/fail with DB writes

---

## Issue #3: Deep Module Principle Not Applied

**Status**: 🔄 IN PROGRESS

### Problem
Some modules expose many shallow functions instead of grouped services:

**Trust Service Over-Exposure** (8 public functions):
- `recordDeposit`, `recordWithdrawal` (primitives)
- `manualDeposit`, `manualWithdrawal` (business logic)
- `getTransactions`, `getBalance`, `getBalanceWithTx`, `getReport` (queries)
- Plus internal helpers: `withTrustLock()` exposed

**Invoice Services Over-Specialization** (11 service files):
- Each file ~50-100 lines
- Handlers import 4-6 services per operation
- Public interface ≈ implementation size

### Impact
- High cognitive load ("which function do I need?")
- No clear semantics (are these all equally important?)
- Changes to shared logic affect multiple exports
- Test setup complex (many mocks needed)
- Interface ≈ implementation (anti-pattern)

### Resolution
**Group related operations under deep module services**

Target state:
- **Trust Service**: 2-3 public methods (manualDeposit, manualWithdrawal, getBalance) hiding locking, syncing, threshold checks
- **Invoice Services**: 3-4 workflow-based operations hiding 11 current services

Each service is **deep**:
- Small interface (2-3 functions)
- Large implementation (100-200 lines total per service)
- Hides complexity behind simple operations

---

## Issue #4: Result<T> Pattern Overhead

**Status**: ✅ RESOLVED (Invoices done, pending rollout)

### Problem
Many modules return Result<T> objects:
```typescript
const result = await service.create(...);
if (!result.success) {
  // Handle error
} else {
  // Use result.data
}
```

This required:
- Handlers understanding Result shape
- Calling helper methods (`result.badRequest()`)
- Type system doesn't prevent forgetting `.success` check
- Mixed paradigm: some services throw, some return Result

### Resolution
**Unified throw-based errors (see Issue #1)**

All services throw. Period.

```typescript
// Service throws directly
const create = async ({ data }, ctx) => {
  if (!data.name) {
    throw createValidationError('NAME_REQUIRED', 'Name required');
  }
  return await ctx.db.insert(things).values({...}).returning();
};

// Handler never catches or checks
const handler = async (c) => {
  const result = await service.create({ data }, ctx);  // throws if error
  return c.json(result);
};
```

**Benefits:**
- Clear happy path (return data)
- Clear error path (throw)
- Consistent across all modules
- Type system enforces: if you don't throw, you must return something

---

## Issue #5: Relative Import Paths

**Status**: ✅ RESOLVED

### Problem
Code used relative imports (`../../../shared/types/errors`) which:
- Break when files move
- Hard to understand depth
- Inconsistent across codebase

### Resolution
**Always use `@/` path aliases**

Enforced via ESLint. All code uses:
```typescript
import { createAppError } from '@/shared/types/errors';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
```

No relative imports anywhere.

---

## Issue #6: Event Emission Timing (Atomicity)

**Status**: ✅ RESOLVED (Invoices done, pending rollout)

### Problem
Events could be emitted outside transaction scope:
- Event emitted but transaction rolled back
- No guarantees about order of DB writes and events
- Inconsistent state in event handlers

### Resolution
**Transactional Outbox Pattern: Events emitted within transaction**

Events emitted within the same transaction as DB changes:

```typescript
const createInvoice = async ({ data }, ctx) => {
  return await ctx.db.transaction(async (tx) => {
    const [invoice] = await tx.insert(invoices).values({...}).returning();

    // Event emitted within same transaction
    await ctx.emit(InvoiceCreated, { invoice_id: invoice.id }, { tx });

    return invoice;  // Commit happens after this line
  });
};
```

If transaction rolls back, events don't emit. If event emits, transaction succeeded.

**Benefits:**
- Guaranteed atomicity between DB writes and event emission
- No "action succeeded but webhook didn't" scenarios
- Webhook handlers see consistent state
- Retries are safe (idempotent operations)

---

## Issue #7: Cross-Module Query Access (Data Access Coupling)

**Status**: 🟡 MEDIUM PRIORITY

### Problem
Services import queries from other modules for validation:
- `invoices` imports mattersQueries, clientsRepository, practiceServicesRepository
- `trust` imports mattersQueries to sync balances
- All modules import domain query modules for validation

### Impact
- Service business logic can't be unit tested without mocking 3+ repository modules
- Creates tight coupling between domains
- Hard to understand dependency chains

### Opportunity
- Extract validation queries into a shared validation layer
- Or use a repository injection pattern
- Create validation orchestrator that encapsulates dependency chain

---

## Issue #8: Invoice Creation Validation Fragmentation

**Status**: 🟡 MEDIUM PRIORITY

### Problem
CreateInvoice validation scattered across 4 modules:
1. Resolve client (via invoiceClientResolver → clientsRepository + mattersQueries)
2. Validate connected account (via invoiceValidators → onboarding state)
3. Validate matter belongs to client (mattersQueries)
4. Validate practice service (practiceServicesRepository)
5. Calculate totals (calculateInvoiceTotals)
6. Determine fund destination (getFundDestination)

### Impact
- Creates test setup complexity
- Cross-domain coupling
- Validation logic scattered across files

### Opportunity
- Validation orchestrator that encapsulates dependency chain
- Single entry point for all invoice creation validation

---

## Summary Table

| Issue | Status | Pattern |
|-------|--------|---------|
| Mixed error handling | ✅ Partial (Invoices done) | Throw-based + factory functions |
| Transaction boundaries | ✅ Resolved | Handlers own transactions |
| Deep modules | 🔄 In progress | Small interface, large implementation |
| Result<T> overhead | ✅ Resolved (pending rollout) | Unified throw-based errors |
| Relative imports | ✅ Resolved | Always use @/ aliases |
| Event timing | ✅ Resolved (pending rollout) | Transactional outbox pattern |
| Cross-module queries | 🟡 Medium | Validation layer / injection pattern |
| Validation fragmentation | 🟡 Medium | Orchestrator pattern |

---

## Migration Roadmap

**Phase 1 (Current Focus):**
- Error handling migration: Trust → Subscriptions → Uploads → Matters → Practice-Client-Intakes → Onboarding
- Enables global error middleware

**Phase 2 (Next):**
- Deep module refactoring (Trust service, Invoice services consolidation)
- Reduces cognitive load and improves testability

**Phase 3:**
- Cross-module coupling reduction (validation layer, repository injection)
- Event timing and atomicity audit

---

## Reference Documents

- See `.agents/workflows/coding-standards.md` Section 7 & 12 for implementation details
- See `plans/ideal-architecture.md` for target architecture, phases, and detailed migration steps
