# Architectural Issues & Resolutions

> Archived historical plan. Do not execute directly without first verifying every relevant claim against current code. See `docs/PRIORITY.md` for current work ordering.

This document tracks architectural problems identified in Blawby and their resolutions.

---

## Issue #1: Mixed Error Handling Paradigms

**Status**: ✅ RESOLVED

### Problem
The codebase previously mixed service response wrappers with throw-based error handling.

This creates:
- Inconsistent error handling across modules
- Mixed cognitive load
- Verbose handler code checking success flags
- Global error middleware can't work consistently

### Impact
- Developers must learn two patterns
- Integration tests harder (different error shapes)
- Debugging requires checking logs AND database state
- Error context (which resource, which org) is lost
- No consistent error handling surface for monitoring/alerting

### Resolution
**Unified throw-based error handling**

Current code has no `Result<T>` or `sendResult` usage in `src/` or `test/`. Services now return data directly and throw for failures:

```typescript
const create = async (...): Promise<Invoice> => {
  if (!valid) throw new HTTPException(400, { message: 'Invalid' });
  return invoice;
};
```

Workers and webhook code throw raw `Error` when failures should trigger retry infrastructure.

---

## Issue #2: Transaction Boundaries Scattered

**Status**: ✅ RESOLVED (Invoices implemented)

### Problem
Unclear transaction ownership:
- Some services opened direct transactions (`db.transaction()`)
- Some expected transactions passed in
- Some ignored transaction state
- Event emissions could happen outside transaction scope

This created:
- Ambiguous atomicity guarantees
- Risks of partial updates on failure
- Events emitted but DB rolled back
- Hard to test transaction behavior

### Resolution
**Single source of transaction ownership: Unit of Work**

Application code opens transactions through `uow.transaction(...)`; repositories and helpers use `getActiveTx()` so nested calls join the active transaction automatically:

```typescript
const createInvoice = async ({ data }, ctx) => {
  return await uow.transaction(async () => {
    const [invoice] = await getActiveTx().insert(invoices).values({...}).returning();

    await ctx.emit(InvoiceCreated, { invoice_id: invoice.id });

    return invoice;
  });
};
```

**Benefits:**
- Clear ownership and atomicity guarantees
- Nested calls join the active transaction
- No accidental nested transaction risks
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

## Issue #4: Service Response Wrapper Overhead

**Status**: ✅ RESOLVED

### Problem
Many modules previously returned encoded success/error objects:
```typescript
const result = await service.create(...);
if (!result.success) {
  // Handle error
} else {
  // Use result.data
}
```

This required:
- Handlers understanding the wrapper shape
- Type system doesn't prevent forgetting `.success` check
- Mixed paradigm: some services throw, some return wrappers

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
  return await uow.transaction(async () => {
    const [invoice] = await getActiveTx().insert(invoices).values({...}).returning();

    // Event emitted within same transaction
    await ctx.emit(InvoiceCreated, { invoice_id: invoice.id });

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
| Mixed error handling | ✅ Resolved | Throw-based services |
| Transaction boundaries | ✅ Resolved | Use `uow.transaction(...)` and `getActiveTx()` |
| Deep modules | 🔄 In progress | Small interface, large implementation |
| Service wrapper overhead | ✅ Resolved | Unified throw-based errors |
| Relative imports | ✅ Resolved | Always use @/ aliases |
| Event timing | ✅ Resolved (pending rollout) | Transactional outbox pattern |
| Cross-module queries | 🟡 Medium | Validation layer / injection pattern |
| Validation fragmentation | 🟡 Medium | Orchestrator pattern |

---

## Migration Roadmap

**Phase 1:**
- Error handling migration complete; keep new/touched code throw-based.

**Phase 2 (Next):**
- Deep module refactoring (Trust service, Invoice services consolidation)
- Reduces cognitive load and improves testability

**Phase 3:**
- Cross-module coupling reduction (validation layer, repository injection)
- Event timing and atomicity audit

---

## Reference Documents

- See `AGENTS.md` for current repository rules and `docs/CODING_STANDARDS.md` for concrete examples.
- See `plans/ideal-architecture.md` for target architecture, phases, and detailed migration steps
