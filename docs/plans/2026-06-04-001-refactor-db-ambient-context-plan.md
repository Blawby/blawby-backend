---
title: "refactor: Proper Unit of Work with AsyncLocalStorage"
date: 2026-06-04
status: active
origin: docs/brainstorms/database-ambient-context.md
---

# refactor: Proper Unit of Work with AsyncLocalStorage

> **For agentic workers:** Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Replace all `db`/`tx` parameter threading with a proper Unit of Work pattern. Repositories are class-based and use `AsyncLocalStorage` to automatically join the active transaction — no `tx` param anywhere in application code.

**Architecture:** `UnitOfWork` holds class-based repositories and a `transaction()` method backed by `AsyncLocalStorage`. `transaction()` implements REQUIRED propagation (nested calls join the outer tx automatically). Repositories call `getActiveTx() ?? db` internally — both reads and writes use ambient context. Services call `uow.transaction(async () => {...})` with no tx param. Helper functions that span multiple repos call `uow.xyz.method()` directly — no tx threading.

**Tech Stack:** Node.js `AsyncLocalStorage` (stdlib), Drizzle ORM, TypeScript, `ts-morph` codemod (`scripts/codemod-readonly-repos.ts`)

**Why ALS is appropriate here:** ALS is considered an anti-pattern when used to hide *business* dependencies. For infrastructure runtime state (the active transaction) it is the accepted solution — used by Spring `TransactionSynchronizationManager`, Rails connection pool, Django `transaction.atomic()`. The alternative (explicit `tx` threading) creates 136+ call sites and prevents code reuse across multi-table helpers without duplication.

---

## Current State (as of 2026-06-04)

Two modules partially migrated to a *half-UoW*: repos made read-only, writes inlined. This approach still requires `tx` param on cross-module helper functions (`createMatterFromIntakeTx`, `createMatterFromAcceptedContract`). Revising to full ALS-based UoW eliminates this.

Already done:
- `src/shared/database/uow.ts` — UoW singleton exists but lacks ALS
- `engagement-contracts.queries.ts` — reads only (function-based)
- `practice-client-intakes.repository.ts` — reads only (function-based)
- Codemod at `scripts/codemod-readonly-repos.ts`

---

## High-Level Design

```
Service
  └─ uow.transaction(async () => {
       await uow.matters.create({...})     // ambient tx ✅
       await uow.intakes.updateStatus(...) // same ambient tx ✅
       await uow.contracts.update(...)     // same ambient tx ✅
       // zero tx params. zero DbOrTx.
     })

Repository (class-based)
  create(data) {
    return getActiveTx().insert(matters).values(data).returning()
  }
  findById(id) {
    return getActiveTx().select().from(matters).where(...)
  }

UnitOfWork
  transaction(fn: () => Promise<T>): Promise<T>
    // REQUIRED propagation: if ALS already has a tx, reuse it
    // otherwise open db.transaction and store tx in ALS
```

---

## Implementation Units

---

### U1. ALS foundation — update UoW and add `getActiveTx()`

**Goal:** Add `AsyncLocalStorage` to the UoW. `getActiveTx()` returns the active transaction or the global `db`. `transaction()` uses REQUIRED propagation.

**Requirements:** R1, R2, R3 (origin)

**Dependencies:** None

**Files:**
- Modify: `src/shared/database/uow.ts`
- Test: `test/shared/database/uow.test.ts`

**Approach:**

Add `AsyncLocalStorage<Tx>` inside the UoW module (not exported — implementation detail). Export `getActiveTx()` as a module-level function for repositories to use. Update `transaction()` to check ALS before opening a new transaction — if a `Tx` already exists in ALS, call `fn()` directly (REQUIRED propagation).

Export `Tx` type for Tx-helper functions that still need to accept the transaction explicitly during the migration window (cross-module helpers not yet fully converted).

**Patterns to follow:** `src/shared/database/uow.ts` (existing structure)

**Test scenarios:**
- `getActiveTx()` outside `uow.transaction()` returns the global `db` proxy
- `getActiveTx()` inside `uow.transaction()` returns the active transaction executor
- Nested `uow.transaction()` joins the outer transaction — `getActiveTx()` returns the same reference
- `uow.transaction()` rolls back on thrown error; insert inside is absent after rollback
- Two concurrent `uow.transaction()` calls do not share ALS context

**Verification:** New unit tests pass. `pnpm run typecheck` clean.

---

### U2. Class-based repository template

**Goal:** Establish the class-based repository pattern. One repository converted as the canonical example for all subsequent module migrations.

**Requirements:** R5, R6 (origin)

**Dependencies:** U1

**Files:**
- Modify: `src/modules/engagement-contracts/database/queries/engagement-contracts.queries.ts` (convert to class)
- Modify: `src/shared/database/uow.ts` (register class instance)
- Test: `test/modules/engagement-contracts/engagement-contracts.repository.test.ts`

**Approach:**

Convert `engagementContractsQueries` from an exported object of functions to an exported class `EngagementContractRepository`. Each method calls `getActiveTx()` internally for both reads and writes. Reads and writes are both on the class — no separation. Write methods (previously deleted by codemod) are restored as class methods using `getActiveTx()`.

Register an instance in `uow.ts`: `readonly engagementContracts = new EngagementContractRepository()`.

Update `engagement-contract.service.ts` to call `uow.engagementContracts.insert(...)` and `uow.engagementContracts.update(...)` instead of inline `tx.insert(...)` / `tx.update(...)`.

The codemod `scripts/codemod-readonly-repos.ts` is updated to generate class-based repositories instead of function-based read-only ones.

**Patterns to follow:** This unit IS the pattern. Future modules follow it.

**Test scenarios:**
- `EngagementContractRepository.insert()` inside `uow.transaction()` writes the row atomically; outer rollback removes it
- `EngagementContractRepository.findById()` outside any transaction reads committed data
- `EngagementContractRepository.update()` inside `uow.transaction()` uses the ambient tx

**Verification:** `pnpm run typecheck` clean. `engagement-contract.service.ts` has no inline `tx.insert/tx.update` calls and no `tx` parameter.

---

### U3. Revise intake module — class-based repository

**Goal:** Apply the class-based pattern established in U2 to the intake module.

**Requirements:** R5, R6 (origin)

**Dependencies:** U1, U2

**Files:**
- Modify: `src/modules/practice-client-intakes/database/queries/practice-client-intakes.repository.ts`
- Modify: `src/shared/database/uow.ts`
- Modify: `src/modules/practice-client-intakes/services/intake-creation.service.ts`
- Modify: `src/modules/practice-client-intakes/services/intake-lifecycle.service.ts`
- Modify: `src/modules/practice-client-intakes/services/intake-checkout.service.ts`
- Modify: `src/modules/practice-client-intakes/services/intake-shared.helpers.ts`

**Approach:**

Convert `practiceClientIntakesRepository` to class `PracticeClientIntakeRepository`. Restore write methods (`create`, `update`, `updateStatus`) as class methods using `getActiveTx()`. Remove all inline `tx.update(practiceClientIntakes)` calls from service files — replace with `uow.practiceClientIntakes.update(...)` calls. The `createMatterFromIntakeTx` helper removes its `tx` parameter — it now calls `uow.matters.create(...)` etc. using ambient context.

**Note:** `uow.matters` does not exist until the matters module is migrated (U5). During this unit, `createMatterFromIntakeTx` still passes `tx` to `mattersQueries.createMatter(data, tx)` — document this as a temporary state to be cleaned up in U5.

**Test scenarios:**
- `PracticeClientIntakeRepository.create()` inside `uow.transaction()` is atomic with other writes in the same transaction
- `PracticeClientIntakeRepository.updateStatus()` inside `uow.transaction()` uses ambient tx
- `intake-lifecycle.service.ts` `convertIntake` wraps entire operation in `uow.transaction()` without passing tx to helpers

**Verification:** `pnpm run typecheck` clean. No `tx` parameter on intake helper functions except the temporary `mattersQueries.createMatter(data, tx)` call.

---

### U4. Migrate clients module

**Goal:** Convert `clientsRepository` to class-based, register in UoW.

**Requirements:** R5, R6, R7 (origin)

**Dependencies:** U1, U2

**Files:**
- Modify: `src/modules/clients/database/queries/clients.queries.ts`
- Modify: `src/modules/clients/database/queries/practice-client-memos.queries.ts`
- Modify: `src/shared/database/uow.ts`
- Modify: `src/modules/clients/services/clients-crud.service.ts`
- Modify: `src/modules/clients/services/clients-utils.ts`

**Approach:** Same pattern as U2/U3. Convert to class, restore write methods with `getActiveTx()`, update services to use `uow.clients.*`.

`clients-crud.service.ts` currently calls `usersRepository.update(userId, data, tx)` — with ALS this becomes `uow.users.update(userId, data)` once the users/shared repos are migrated (U7). Temporary: keep the `tx` pass-through to `usersRepository.update` until U7.

**Test scenarios:**
- `ClientRepository.create()` and `ClientRepository.findById()` use ambient context correctly
- `clients-crud.service.ts` `createClient` atomically creates client and member in one transaction

**Verification:** `pnpm run typecheck` clean.

---

### U5. Migrate matters module

**Goal:** Convert matters queries to class-based, register in UoW. Eliminates the last `tx` parameter from `createMatterFromIntakeTx` and `createMatterFromAcceptedContract`.

**Requirements:** R5, R6 (origin)

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `src/modules/matters/database/queries/matters.queries.ts`
- Modify: `src/modules/matters/database/queries/matter-status-history.queries.ts`
- Modify: `src/modules/matters/database/queries/matter-tasks.queries.ts`
- Modify: `src/modules/matters/database/queries/matter-milestones.queries.ts`
- Modify: `src/modules/matters/services/matter-activity.service.ts`
- Modify: `src/modules/matters/services/matters.service.ts`
- Modify: `src/shared/database/uow.ts`
- Modify: `src/modules/practice-client-intakes/services/intake-lifecycle.service.ts` (remove `tx` from `createMatterFromIntakeTx`)
- Modify: `src/modules/engagement-contracts/services/engagement-contract.service.ts` (remove `tx` from `createMatterFromAcceptedContract`)

**Approach:** After `uow.matters` exists, `createMatterFromIntakeTx` and `createMatterFromAcceptedContract` drop their `tx` parameter — they call `uow.matters.create(...)` using ambient context. Rename both helpers (drop the `Tx` suffix): `createMatterFromIntake`, `createMatterFromAcceptedContract`.

**Test scenarios:**
- `createMatterFromIntake` called inside `uow.transaction()` creates matter, milestones, and notes atomically — no tx parameter
- Rollback of outer transaction removes all created records

**Verification:** `pnpm run typecheck` clean. Zero `Tx`-suffixed helper functions remain.

---

### U6. Migrate invoices module

**Goal:** Convert invoice repositories to class-based. Invoice module has the most `tx` threading (74 sites).

**Requirements:** R5, R6, R7 (origin)

**Dependencies:** U1, U2

**Files:**
- Modify: `src/modules/invoices/database/queries/invoices.repository.ts`
- Modify: `src/modules/invoices/database/queries/billing-transactions.repository.ts`
- Modify: `src/modules/invoices/database/queries/refund-requests.queries.ts`
- Modify: `src/shared/database/uow.ts`
- Modify: All invoice service files (`invoice.service.ts`, `invoice-creation.helpers.ts`, `invoice.delivery.lock.ts`, `invoice.delivery.service.ts`, `invoice.voiding.service.ts`, `invoice-lifecycle.helpers.ts`, `invoice.webhook.service.ts`, `refund-requests.service.ts`)

**Approach:** Same class pattern. The invoice services have the most `ctx.db.transaction()` calls — all become `uow.transaction()`. Note: `dispatchCritical` and `dispatchAsync` in the event system bypass ALS by design — do not change these.

**Test scenarios:**
- Invoice creation, delivery lock, and event dispatch are atomic in one `uow.transaction()`
- Webhook service writes use ambient context correctly

**Verification:** `pnpm run typecheck` clean. No `typeof db`, `DbOrTx`, or `tx` parameters in invoice query files.

---

### U7. Migrate subscriptions, practice, shared repositories, and financial engines

**Goal:** Migrate remaining modules. Includes the `pg_advisory_xact_lock` in `trust.service.ts`.

**Requirements:** R5, R6, R7, R8 (origin)

**Dependencies:** U1, U2

**Files:**
- `src/modules/subscriptions/database/queries/subscription.repository.ts`
- `src/modules/subscriptions/services/` (all)
- `src/modules/practice/services/` (all)
- `src/shared/repositories/sessions.repository.ts`
- `src/shared/repositories/users.repository.ts`
- `src/shared/repositories/members.repository.ts`
- `src/shared/auth/services/link-user-data.service.ts`
- `src/engines/financial/` (all)
- `src/modules/trust/services/trust.service.ts`
- `src/shared/database/uow.ts`

**Approach:** Same class pattern. For `trust.service.ts` `withTrustLock`: REQUIRED propagation in `uow.transaction()` means nested calls join the outer tx automatically — the `pg_advisory_xact_lock` retry logic (`40001`) only applies when `withTrustLock` opens the transaction itself (no outer ALS context). Check `AsyncLocalStorage.getStore() === undefined` before entering retry loop — if context already exists, propagate `40001` to caller.

**Test scenarios:**
- `withTrustLock` retry fires when called without outer transaction
- `withTrustLock` called inside `uow.transaction()` joins it; `40001` propagates without retry
- Financial engine retainer flow is atomic with calling service's transaction

**Verification:** `pnpm run typecheck` clean. `DbOrTx` type deleted from all files.

---

### U8. Final cleanup — ServiceContext, ctx.emit, and event dispatch

**Goal:** Remove `ServiceContext.db`, remove `tx` from `ctx.emit()`, update event dispatch to use `getActiveTx()`.

**Requirements:** R9, R10, R11, R12 (origin)

**Dependencies:** U1–U7

**Files:**
- Modify: `src/shared/types/service-context.ts`
- Modify: `src/shared/events/event.ts`
- Modify: `src/shared/database/uow.ts` (remove `Tx` export if no longer needed externally)

**Approach:**

`ServiceContext`: remove `db` field. `ctx.emit()` removes `tx` parameter — `dispatchTransactional` calls `getActiveTx()` internally. `BaseEvent.dispatch()` routing: if `getActiveTx()` returns a tx → `dispatchTransactional`. `dispatchCritical` and `dispatchAsync` always use global `db` (bypass ALS by design).

**Test scenarios:**
- `ctx.emit(Event, payload)` inside `uow.transaction()` writes event row in same transaction
- `ctx.emit(Event, payload)` outside any transaction routes to `dispatchAsync`
- `ServiceContext` has no `db` field (TypeScript compile verifies)

**Verification:** `pnpm run typecheck` clean. `grep -r "DbOrTx\|ctx\.db\b\|ctx\.emit.*tx" src/` returns zero matches.

---

### U9. Update codemod for class-based repositories

**Goal:** Update `scripts/codemod-readonly-repos.ts` to generate class-based repositories with `getActiveTx()` instead of read-only function exports.

**Requirements:** Developer tooling

**Dependencies:** U2

**Files:**
- Modify: `scripts/codemod-readonly-repos.ts`

**Approach:** The codemod currently removes write functions and cleans tx params. Update it to instead:
1. Convert the exported object `{ findById, ... }` to a class `XyzRepository` with all original functions as methods
2. Replace `db.` / `tx.` with `getActiveTx().` in all methods
3. Remove `tx` parameters from all method signatures
4. Add `getActiveTx` import
5. Update the export to `export const xyzRepository = new XyzRepository()`
6. Register in `uow.ts` (generate instruction, not auto-write to shared file)

**Test scenarios:**
- Codemod on `engagement-contracts` produces a valid class-based repository with no tx params
- All methods on generated class compile without errors

**Verification:** Dry-run output shows class generation. Generated file passes `pnpm run typecheck`.

---

## Scope Boundaries

- `REQUIRES_NEW` propagation (independent transaction) is out of scope. Add separately if needed (e.g., for audit log writes).
- Migration of webhook handlers in `practice-client-intakes/webhooks.ts` follows the same pattern but is part of U3.
- Legacy `tap` tests in `test/invoices/` are not changed — they test pure functions without DB.
- Fire-and-forget event dispatch (`dispatchAsync`, `dispatchCritical`) intentionally bypasses ALS — do not route these through `getActiveTx()`.

### Deferred to Follow-Up Work

- Convert `uow` singleton to a DI-injectable class when a DI container is introduced
- `REQUIRES_NEW` propagation for `activity_log` writes that need independent commit
- Automated partition creation for `activity_log` (see observability plan)

---

## Key Technical Decisions

- **ALS for infrastructure, not business logic:** `getActiveTx()` provides ambient db context — same pattern as Spring, Rails, Django. Not used to inject repositories or services.
- **REQUIRED propagation in `transaction()`:** Nested `uow.transaction()` calls join the outer tx (Spring default). No second transaction opened.
- **Repositories have both reads and writes:** With ALS, there's no reason to separate them — both use `getActiveTx()`. The Repository Pattern is satisfied: repos are a collection-like interface to persistent objects.
- **`dispatchCritical` / `dispatchAsync` bypass ALS:** These are explicitly fire-after-commit or fire-independent semantics. Correct.
- **Module-by-module migration:** Each unit ships independently. Temporary state (calling `mattersQueries.createMatter(data, tx)` until U5) is acceptable.

---

## Migration Order

```
U1 (ALS foundation) → U2 (engagement-contracts — canonical pattern)
                    → U3 (intake revision)
                    → U4 (clients)
                    → U5 (matters — removes last Tx helpers)
                    → U6 (invoices)
                    → U7 (subscriptions, shared, engines)
                    → U8 (ServiceContext + event dispatch cleanup)
                    → U9 (codemod update)
```

U2–U7 are independent of each other after U1. U8 requires all modules migrated.
