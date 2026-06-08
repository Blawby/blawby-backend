# P0 + P1: Track 1 Close & Unit of Work ALS Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Track 1 (practice_id validation already done), then migrate all remaining modules from explicit `tx` parameter threading to ambient `AsyncLocalStorage` via `getActiveTx()`, eliminating `ctx.db`, `tx` params on services, and `DbOrTx` types across the codebase.

**Architecture:** `getActiveTx()` is already exported from `uow.ts` and returns the ambient transaction or global `db`. Repositories import it and call it on every query instead of accepting `tx` params. Services call `uow.transaction(async () => {...})` with no destructuring — queries automatically join the ambient transaction. `ctx.emit()` will eventually call `getActiveTx()` internally (U8), removing the need to thread tx to events.

**Tech Stack:** Node.js `AsyncLocalStorage`, Drizzle ORM, TypeScript, `ts-morph` codemod

**Migration order:** Task 1 (close Track 1) → Task 2 (U2: engagement-contracts) → Task 3 (U4: clients) → Task 4 (U5: matters) → Task 5 (U6: invoices) → Task 6 (U7: subscriptions/practice/shared/engines) → Task 7 (U8: ServiceContext) → Task 8 (U9: codemod)

---

## Current State

- U1 (ALS foundation): ✅ done — `uow.ts` has `AsyncLocalStorage`, `getActiveTx()`, `uow.transaction()`
- U3 (intake module): ✅ done — `practice-client-intakes.repository.ts` uses factory pattern
- `clients.queries.ts`, `practice-client-memos.queries.ts`, `client-intake-profiles.queries.ts`: ✅ already use `getActiveTx()` directly — no tx params
- `engagement-contracts.queries.ts`: ❌ still uses `tx: typeof db = db` default params
- `matters.queries.ts`: ❌ half-migrated — uses `tx?: DbExecutor` optional params with `tx ?? getActiveTx()` fallback
- `invoices.repository.ts`, shared repos, other modules: ❌ still use `tx ?? db` pattern

---

## Task 1: Close Track 1 — Mark practice_id validation done

**Files:**
- Update: `docs/superpowers/TRACKING.md`
- Update: `docs/PRIORITY.md`

The `assertPracticeMatchesActiveOrg` guard is already implemented in `src/modules/engagement-contracts/handlers.ts` lines 7–11 and called in every handler. This is done. Update the tracking docs.

- [ ] **Step 1: Verify guard exists in all 5 handlers**

```bash
grep -n "assertPracticeMatchesActiveOrg" src/modules/engagement-contracts/handlers.ts
```

Expected: 5 matches — one call per handler (createEngagementContractHandler, listEngagementContractsHandler, getEngagementContractHandler, updateEngagementContractHandler, updateEngagementContractStatusHandler).

- [ ] **Step 2: Update TRACKING.md**

In `docs/superpowers/TRACKING.md`, change the last sub-item of Audit Item 2 from `🔄` to `✅`:

```markdown
| `practice_id` URL param not validated against session active organization in handler/service flow | ✅ |
```

- [ ] **Step 3: Update PRIORITY.md**

In `docs/PRIORITY.md`, remove the Track 1 row from P0:

```markdown
| Track 1 last item: `practice_id` URL param not validated against session org | `docs/superpowers/TRACKING.md` Track 1 | 🔄 | Small fix. Closes Track 1 entirely. |
```

Replace with: *(remove the row entirely — Track 1 is complete)*

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/TRACKING.md docs/PRIORITY.md
git commit -m "docs: close Track 1 — practice_id validation already implemented"
```

---

## Task 2 (U2): Convert engagement-contracts.queries.ts to use getActiveTx()

**Files:**
- Modify: `src/modules/engagement-contracts/database/queries/engagement-contracts.queries.ts`
- Modify: `src/modules/engagement-contracts/services/engagement-contract.service.ts`

**Goal:** Remove `tx` params from all query functions. Update service to use `uow.transaction()` without tx threading.

- [ ] **Step 1: Rewrite engagement-contracts.queries.ts**

Replace entire file content:

```typescript
import { eq, and, desc, count } from 'drizzle-orm';
import { engagementContracts } from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import type {
  InsertEngagementContract,
  SelectEngagementContract,
} from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import type { EngagementContractStatus } from '@/modules/engagement-contracts/types/proposal-data.types';
import { getActiveTx } from '@/shared/database/uow';

const insert = async (data: InsertEngagementContract): Promise<SelectEngagementContract> => {
  const [record] = await getActiveTx().insert(engagementContracts).values(data).returning();
  if (!record) {
    throw new Error('Failed to insert engagement contract');
  }
  return record;
};

const findById = async (id: string): Promise<SelectEngagementContract | undefined> => {
  const [record] = await getActiveTx()
    .select()
    .from(engagementContracts)
    .where(eq(engagementContracts.id, id))
    .limit(1);
  return record;
};

const findByIntakeAndOrg = async (
  intakeId: string,
  organizationId: string,
): Promise<SelectEngagementContract | undefined> => {
  const [record] = await getActiveTx()
    .select()
    .from(engagementContracts)
    .where(and(eq(engagementContracts.intake_id, intakeId), eq(engagementContracts.organization_id, organizationId)))
    .limit(1);
  return record;
};

const findAcceptedByIntakeAndOrg = async (
  intakeId: string,
  organizationId: string,
): Promise<SelectEngagementContract | undefined> => {
  const [record] = await getActiveTx()
    .select()
    .from(engagementContracts)
    .where(
      and(
        eq(engagementContracts.intake_id, intakeId),
        eq(engagementContracts.organization_id, organizationId),
        eq(engagementContracts.status, 'accepted')
      )
    )
    .limit(1);
  return record;
};

const findByMatterAndOrg = async (
  matterId: string,
  organizationId: string,
): Promise<SelectEngagementContract | undefined> => {
  const [record] = await getActiveTx()
    .select()
    .from(engagementContracts)
    .where(and(eq(engagementContracts.matter_id, matterId), eq(engagementContracts.organization_id, organizationId)))
    .limit(1);
  return record;
};

const listByOrg = async (
  organizationId: string,
  filters?: {
    intake_id?: string;
    matter_id?: string;
    status?: EngagementContractStatus;
    limit?: number;
    offset?: number;
  },
): Promise<{ data: SelectEngagementContract[]; total: number }> => {
  const conditions = [eq(engagementContracts.organization_id, organizationId)];

  if (filters?.intake_id) {
    conditions.push(eq(engagementContracts.intake_id, filters.intake_id));
  }
  if (filters?.matter_id) {
    conditions.push(eq(engagementContracts.matter_id, filters.matter_id));
  }
  if (filters?.status) {
    conditions.push(eq(engagementContracts.status, filters.status));
  }

  const [countResult, data] = await Promise.all([
    getActiveTx()
      .select({ total: count() })
      .from(engagementContracts)
      .where(and(...conditions)),
    getActiveTx()
      .select()
      .from(engagementContracts)
      .where(and(...conditions))
      .orderBy(desc(engagementContracts.created_at))
      .limit(filters?.limit ?? 20)
      .offset(filters?.offset ?? 0),
  ]);

  return { data, total: Number(countResult[0]?.total ?? 0) };
};

const update = async (
  id: string,
  data: Partial<InsertEngagementContract>,
): Promise<SelectEngagementContract> => {
  const [record] = await getActiveTx()
    .update(engagementContracts)
    .set(data)
    .where(eq(engagementContracts.id, id))
    .returning();
  if (!record) {
    throw new Error('Failed to update engagement contract');
  }
  return record;
};

export const engagementContractsQueries = {
  insert,
  findById,
  findByIntakeAndOrg,
  findAcceptedByIntakeAndOrg,
  findByMatterAndOrg,
  listByOrg,
  update,
};
```

- [ ] **Step 2: Update engagement-contract.service.ts — replace db.transaction with uow.transaction**

The service has four `db.transaction(async (tx) => {...})` calls. Replace them with `uow.transaction(async () => {...})`. Remove `tx` from all query calls and use `getActiveTx()` for `ctx.emit` tx argument.

At top of file, replace:
```typescript
import { db } from '@/shared/database';
```
with:
```typescript
import { getActiveTx, uow } from '@/shared/database/uow';
```

Then replace each `db.transaction(async (tx) => {` with `uow.transaction(async () => {`.

Remove `tx` arguments from all `engagementContractsQueries.*()` calls (they no longer accept tx).

For each `ctx.emit(Event, payload, tx)` call inside a transaction, change to `ctx.emit(Event, payload, getActiveTx())`.

For `ctx.emit(Event, payload, tx)` calls that pass the outer transaction from services with no explicit `db.transaction`, change to `ctx.emit(Event, payload)` — the event system will use the ambient tx if inside `uow.transaction()` after U8, or global db otherwise.

**Note:** Until U8 lands, `ctx.emit` uses `executor` (global `db`) unless a tx is explicitly passed. For transactional consistency, keep `ctx.emit(Event, payload, getActiveTx())` as the pattern inside `uow.transaction()` blocks in this task.

Specifically, find and update all `await ctx.emit(` calls that currently receive `tx` as third arg — change `tx` to `getActiveTx()`.

- [ ] **Step 3: Typecheck**

```bash
pnpm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/engagement-contracts/database/queries/engagement-contracts.queries.ts \
        src/modules/engagement-contracts/services/engagement-contract.service.ts
git commit -m "refactor(uow): migrate engagement-contracts queries to getActiveTx() (U2)"
```

---

## Task 3 (U4): Migrate clients module — fix service tx threading

**Files:**
- Modify: `src/modules/clients/services/clients-crud.service.ts`
- Modify: `src/modules/clients/services/clients-utils.ts`
- Modify: `src/modules/practice/database/queries/address.repository.ts`
- Modify: `src/shared/repositories/users.repository.ts`

`clients.queries.ts` already uses `getActiveTx()`. The remaining issue is:
1. `clients-crud.service.ts` destructures `{ tx }` from `uow.transaction()` and passes it to `upsertAddressTx`, `usersRepository.update`, `tx.update(clients)`, and event dispatch.
2. `upsertAddressTx` takes `tx` as first arg — needs to be replaced with `getActiveTx()` internally.
3. `usersRepository.update` accepts optional `tx` — will be fully cleaned in U7, but for now `clients-crud` should stop passing it.
4. `clients-utils.ts` uses `uow.transaction(async ({ tx }) => {...})` and passes `tx` to helpers.

- [ ] **Step 1: Migrate upsertAddressTx in address.repository.ts**

Replace the function signature and body to use `getActiveTx()` instead of accepting `tx`:

```typescript
import { eq, and, inArray } from 'drizzle-orm';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import type { AddressData } from '@/modules/practice/types/addresses.types';
import { db } from '@/shared/database';
import { getActiveTx } from '@/shared/database/uow';

export const findAddressesByIds = async (addressIds: string[]): Promise<(typeof addresses.$inferSelect)[]> =>
  addressIds.length === 0 ? [] : await db.select().from(addresses).where(inArray(addresses.id, addressIds));

export const upsertAddress = async (
  params: {
    addressData: AddressData;
    organizationId: string;
    userId?: string | null;
    addressId?: string | null;
    type?: string;
  }
): Promise<typeof addresses.$inferSelect | undefined> => {
  const { addressData, organizationId, userId, addressId: providedAddressId, type = 'practice_location' } = params;
  let targetAddressId = providedAddressId;

  if (!targetAddressId && userId) {
    const existing = await getActiveTx().query.addresses.findFirst({
      where: and(
        eq(addresses.user_id, userId),
        eq(addresses.organization_id, organizationId),
        eq(addresses.type, type)
      ),
    });
    targetAddressId = existing?.id;
  }

  const dataToSave = {
    line1: addressData.line1,
    line2: addressData.line2,
    city: addressData.city,
    state: addressData.state,
    postal_code: addressData.postal_code,
    country: addressData.country,
  };

  if (targetAddressId) {
    const [updatedAddress] = await getActiveTx()
      .update(addresses)
      .set({ ...dataToSave, updated_at: new Date() })
      .where(and(eq(addresses.id, targetAddressId), eq(addresses.organization_id, organizationId)))
      .returning();
    return updatedAddress;
  } else {
    const [newAddress] = await getActiveTx()
      .insert(addresses)
      .values({
        organization_id: organizationId,
        user_id: userId,
        type,
        ...dataToSave,
      })
      .returning();
    return newAddress;
  }
};

// Backward-compatible alias — remove after all callers migrated in U7
export const upsertAddressTx = (
  _tx: unknown,
  params: Parameters<typeof upsertAddress>[0]
): ReturnType<typeof upsertAddress> => upsertAddress(params);
```

**Note:** Keep `upsertAddressTx` as a shim for `practice-client-intakes/services/intake-creation.service.ts` and `practice/services/practice-management.helpers.ts` which will be migrated in U7. The shim ignores the `tx` argument since `upsertAddress` uses `getActiveTx()` internally.

- [ ] **Step 2: Update clients-crud.service.ts imports and uow.transaction calls**

Replace the import of `upsertAddressTx` with `upsertAddress`:

```typescript
import { upsertAddress } from '@/modules/practice/database/queries/address.repository';
```

Change `uow.transaction(async ({ tx }) => {` → `uow.transaction(async () => {` in all occurrences.

Replace `upsertAddressTx(tx, { ... })` → `upsertAddress({ ... })` in both createClient and updateClient.

Replace inline `await tx.update(clients).set(updatePayload).where(eq(clients.id, id))` with the existing `clientsRepository.update()` call pattern (or add an update method to `clients.queries.ts` if needed — see Step 3).

Replace `usersRepository.update(userId, data, tx)` → `usersRepository.update(userId, data)` (usersRepository.update accepts optional tx; drop it here even though it's not yet ALS-aware — it will default to `db` which is fine for now; transactional consistency will be restored in U7 when usersRepository is migrated).

Replace `void ClientUpdated.dispatch({ ... }, { actorId, organizationId, tx })` → `void ClientUpdated.dispatch({ ... }, { actorId, organizationId })`.

- [ ] **Step 3: Check clients.queries.ts has an update method**

```bash
grep -n "^const update" src/modules/clients/database/queries/clients.queries.ts
```

If missing, add to `clients.queries.ts`:

```typescript
const update = async (id: string, data: Partial<InsertClient>): Promise<SelectClient | undefined> => {
  const [updated] = await getActiveTx()
    .update(clients)
    .set(data)
    .where(eq(clients.id, id))
    .returning();
  return updated;
};
```

Export it in the `clientsRepository` object.

- [ ] **Step 4: Update clients-utils.ts**

In `resolveUserForIntake`, change `uow.transaction(async ({ tx }) => {` → `uow.transaction(async () => {`.

Change `linkAnonymousUserData({ ..., tx })` → this function still needs a tx in U4. Pass `getActiveTx()` as the tx:

```typescript
import { getActiveTx, uow } from '@/shared/database/uow';
// ...
return uow.transaction(async () => {
  await linkAnonymousUserData({
    anonymousUser: { id: userId, email: '' },
    newUser: { id: existingUserByEmail.id, email: existingUserByEmail.email },
    tx: getActiveTx() as Parameters<typeof linkAnonymousUserData>[0]['tx'],
  });
  await getActiveTx().delete(users).where(eq(users.id, userId));
  return usersRepository.update(existingUserByEmail.id, { ... });
});
```

- [ ] **Step 5: Typecheck**

```bash
pnpm run typecheck
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/clients/services/clients-crud.service.ts \
        src/modules/clients/services/clients-utils.ts \
        src/modules/practice/database/queries/address.repository.ts \
        src/modules/clients/database/queries/clients.queries.ts
git commit -m "refactor(uow): migrate clients module tx threading to getActiveTx() (U4)"
```

---

## Task 4 (U5): Migrate matters.queries.ts — remove optional tx params

**Files:**
- Modify: `src/modules/matters/database/queries/matters.queries.ts`
- Modify: `src/modules/matters/database/queries/matter-status-history.queries.ts`
- Modify: `src/modules/matters/database/queries/matter-tasks.queries.ts`
- Modify: `src/modules/matters/database/queries/matter-milestones.queries.ts`
- Modify: any callers that pass explicit `tx` to these functions

**Goal:** `matters.queries.ts` currently uses `tx ?? getActiveTx()` pattern with optional tx params. Remove the optional params — just call `getActiveTx()` directly.

- [ ] **Step 1: Check all matter query files for tx params**

```bash
grep -n "tx?: DbExecutor\|tx: DbExecutor\|tx?: typeof db\|tx: typeof db" \
  src/modules/matters/database/queries/matters.queries.ts \
  src/modules/matters/database/queries/matter-status-history.queries.ts \
  src/modules/matters/database/queries/matter-tasks.queries.ts \
  src/modules/matters/database/queries/matter-milestones.queries.ts
```

- [ ] **Step 2: Update matters.queries.ts**

For every function with signature `(... tx?: DbExecutor)`:
1. Remove `tx?: DbExecutor` param
2. Remove `const client = tx ?? getActiveTx()` line
3. Replace `client.` with `getActiveTx().`

Remove the `type DbExecutor` declaration and the `db` import (keep `getActiveTx` import).

Pattern — before:
```typescript
const createMatter = async (data: InsertMatter, tx?: DbExecutor): Promise<SelectMatter> => {
  const client = tx ?? getActiveTx();
  const [matter] = await client.insert(matters).values(data).returning();
  return matter;
};
```

After:
```typescript
const createMatter = async (data: InsertMatter): Promise<SelectMatter> => {
  const [matter] = await getActiveTx().insert(matters).values(data).returning();
  return matter;
};
```

Apply this transformation to ALL functions in the file.

- [ ] **Step 3: Apply same transformation to the other three matter query files**

Same pattern: remove `tx` param, `const client = tx ?? getActiveTx()` → call `getActiveTx()` directly.

- [ ] **Step 4: Fix callers that pass explicit tx to mattersQueries functions**

```bash
grep -rn "mattersQueries\.\|mattersRepository\." src --include="*.ts" | grep "tx"
```

For each caller, remove the `tx` argument from the call. If the caller is inside a `uow.transaction()` block, `getActiveTx()` will automatically pick up the ambient tx.

Key files to check:
- `src/modules/practice-client-intakes/services/intake-lifecycle.service.ts` — `createMatterFromIntakeTx` passes tx to `mattersQueries.createMatter(data, tx)` → remove the `tx` argument
- `src/modules/engagement-contracts/services/engagement-contract.service.ts` — `createMatterFromAcceptedContract` similarly

After removing tx arg from `mattersQueries.createMatter(data)`, rename the helpers:
- `createMatterFromIntakeTx` → `createMatterFromIntake` in `intake-lifecycle.service.ts`
- `createMatterFromAcceptedContract` already has no Tx suffix — verify it has no tx pass-through remaining

- [ ] **Step 5: Typecheck**

```bash
pnpm run typecheck
```

Expected: zero errors. Zero `Tx`-suffixed helper functions remain.

- [ ] **Step 6: Commit**

```bash
git add src/modules/matters/database/queries/ \
        src/modules/practice-client-intakes/services/intake-lifecycle.service.ts \
        src/modules/engagement-contracts/services/engagement-contract.service.ts
git commit -m "refactor(uow): migrate matters queries to getActiveTx(), remove Tx suffix helpers (U5)"
```

---

## Task 5 (U6): Migrate invoices repositories

**Files:**
- Modify: `src/modules/invoices/database/queries/invoices.repository.ts`
- Modify: `src/modules/invoices/database/queries/billing-transactions.repository.ts`
- Modify: `src/modules/invoices/database/queries/refund-requests.queries.ts`
- Modify: All invoice service files (see below)

**Goal:** Remove `tx ?? db` and `tx ?? getActiveTx()` patterns from all invoice query files. Update services to call `uow.transaction()` without `{ tx }` destructuring.

- [ ] **Step 1: Identify all tx patterns in invoice query files**

```bash
grep -n "tx\b" \
  src/modules/invoices/database/queries/invoices.repository.ts \
  src/modules/invoices/database/queries/billing-transactions.repository.ts \
  src/modules/invoices/database/queries/refund-requests.queries.ts
```

- [ ] **Step 2: Rewrite invoices.repository.ts**

Pattern: all function signatures with `tx?: Tx` or `tx?: DbOrTx` → remove tx param. Replace `const client = tx ?? db` with direct `getActiveTx()` calls. Replace `tx.` with `getActiveTx().`.

Add at top:
```typescript
import { getActiveTx } from '@/shared/database/uow';
```

Remove:
```typescript
import { db } from '@/shared/database';
// and: type DbOrTx = ... (if present)
```

Example transformation:
```typescript
// Before
const findInvoiceById = async (id: string, tx?: Tx): Promise<...> => {
  const client = tx ?? db;
  const [row] = await client.select()...
  return row;
};

// After
const findInvoiceById = async (id: string): Promise<...> => {
  const [row] = await getActiveTx().select()...
  return row;
};
```

Apply to ALL functions. There are ~13 functions using `tx`.

- [ ] **Step 3: Apply same transformation to billing-transactions.repository.ts and refund-requests.queries.ts**

Same mechanical transformation: remove tx params, replace `tx ?? db` / `client.` with `getActiveTx()`.

- [ ] **Step 4: Update invoice service files — remove { tx } destructuring**

Service files to update:
- `src/modules/invoices/services/invoice.service.ts`
- `src/modules/invoices/services/invoice-creation.helpers.ts`
- `src/modules/invoices/services/invoice.delivery.lock.ts`
- `src/modules/invoices/services/invoice.delivery.service.ts`
- `src/modules/invoices/services/invoice.voiding.service.ts`
- `src/modules/invoices/services/invoice-lifecycle.helpers.ts`
- `src/modules/invoices/services/invoice.webhook.service.ts`
- `src/modules/invoices/services/refund-requests.service.ts`

For each file:
1. Change `ctx.db.transaction(async (tx) => {` → `uow.transaction(async () => {`
2. Change `uow.transaction(async ({ tx }) => {` → `uow.transaction(async () => {`
3. Remove `tx` arg from all repository calls (they now use `getActiveTx()`)
4. Change `ctx.emit(Event, payload, tx)` → `ctx.emit(Event, payload, getActiveTx())`
5. Add `import { getActiveTx, uow } from '@/shared/database/uow'` where needed
6. Remove unused `db` import where it was only used for transactions

**Note on dispatchCritical / dispatchAsync:** Do NOT touch these — they intentionally bypass ALS and use global `db`.

- [ ] **Step 5: Update process-invoice-payment worker task**

`src/workers/tasks/process-invoice-payment.ts` uses `db.transaction(async (tx) => { ... })` and passes `tx` explicitly. Change to `uow.transaction(async () => { ... })`, remove all `tx` args from repository calls inside.

- [ ] **Step 6: Typecheck**

```bash
pnpm run typecheck
```

Expected: zero errors. No `DbOrTx` or `tx` parameters in invoice query files.

- [ ] **Step 7: Commit**

```bash
git add src/modules/invoices/
git commit -m "refactor(uow): migrate invoices module to getActiveTx() (U6)"
```

---

## Task 6 (U7): Migrate subscriptions, practice, shared repos, financial engines

**Files (all use DbOrTx or tx params — apply getActiveTx() transformation):**
- `src/modules/subscriptions/database/queries/subscription.repository.ts`
- `src/modules/subscriptions/services/*.ts` (all service files)
- `src/modules/practice/services/*.ts` (all service files)
- `src/modules/practice/database/queries/organization.repository.ts`
- `src/shared/repositories/sessions.repository.ts`
- `src/shared/repositories/users.repository.ts`
- `src/shared/repositories/members.repository.ts`
- `src/shared/auth/services/link-user-data.service.ts`
- `src/engines/financial/*.ts` (transfer-executor, billing-recorder, refund-engine, refund-reconciliation, fund-management, retainer-payment-flow)
- `src/modules/trust/services/trust.service.ts`
- `src/modules/practice/database/queries/address.repository.ts` — remove `upsertAddressTx` shim, update remaining callers (`intake-creation.service.ts`, `practice-management.helpers.ts`) to use `upsertAddress`

**For subscriptions, practice, shared repos:** Apply same mechanical transformation as Tasks 4–5:
1. Remove tx params from query functions
2. Replace `tx ?? db` / `const client = tx ?? ...` with `getActiveTx()`
3. Update services to use `uow.transaction(async () => {...})` without tx destructuring
4. Remove `DbOrTx` type declarations

- [ ] **Step 1: Migrate shared repositories**

For `users.repository.ts`, `sessions.repository.ts`, `members.repository.ts`:

```bash
grep -n "DbOrTx\|tx\b" \
  src/shared/repositories/users.repository.ts \
  src/shared/repositories/sessions.repository.ts \
  src/shared/repositories/members.repository.ts
```

Remove `type DbOrTx = ...` declarations. Remove `tx?: DbOrTx` params. Replace `tx ?? db` with `getActiveTx()`. Add `getActiveTx` import.

- [ ] **Step 2: Migrate link-user-data.service.ts**

```bash
grep -n "tx\b" src/shared/auth/services/link-user-data.service.ts
```

Remove tx param from the function if present. Use `getActiveTx()` internally.

Update caller in `clients-utils.ts` (Task 3 Step 4 — remove the `tx: getActiveTx()` pass since the function now uses `getActiveTx()` directly).

- [ ] **Step 3: Migrate financial engines**

```bash
grep -rn "tx\b\|typeof db\b" src/engines/financial/
```

For each engine file that uses tx params: remove params, use `getActiveTx()`.

`transfer-executor.ts` uses `stripe.transfers.create()` — no tx involved, skip.

`billing-recorder.ts`, `refund-engine.ts`, `refund-reconciliation.ts` — likely have `tx` params passed in. Apply same transformation.

- [ ] **Step 4: Migrate trust.service.ts — handle pg_advisory_xact_lock**

For `withTrustLock` or equivalent advisory lock function:

```typescript
import { getActiveTx, uow } from '@/shared/database/uow';
import { db } from '@/shared/database';

// Check if we're already inside a uow.transaction() by seeing if getActiveTx()
// returns something other than the global db singleton.
const hasAmbientTx = (): boolean => getActiveTx() !== db;

const withTrustLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (hasAmbientTx()) {
    // Already inside a transaction — join it, propagate 40001 to caller
    return fn();
  }
  // No ambient tx — open one with retry for serialization failures
  let attempt = 0;
  while (true) {
    try {
      return await uow.transaction(async () => {
        await getActiveTx().execute(sql`SELECT pg_advisory_xact_lock(${TRUST_LOCK_KEY})`);
        return fn();
      });
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === '40001' && attempt < 3) {
        attempt++;
        continue;
      }
      throw err;
    }
  }
};
```

- [ ] **Step 5: Remove upsertAddressTx shim from address.repository.ts**

Update remaining callers:
- `src/modules/practice-client-intakes/services/intake-creation.service.ts`: change `upsertAddressTx(params.tx, {...})` → `upsertAddress({...})`
- `src/modules/practice/services/practice-management.helpers.ts`: same

Then remove `upsertAddressTx` from `address.repository.ts`.

- [ ] **Step 6: Typecheck**

```bash
pnpm run typecheck
```

Expected: zero errors. `grep -r "DbOrTx" src/` returns zero matches.

- [ ] **Step 7: Commit**

```bash
git add src/modules/subscriptions/ src/modules/practice/ src/shared/repositories/ \
        src/shared/auth/ src/engines/financial/ src/modules/trust/ \
        src/modules/practice/database/queries/address.repository.ts \
        src/modules/practice-client-intakes/services/intake-creation.service.ts
git commit -m "refactor(uow): migrate subscriptions/practice/shared/engines to getActiveTx() (U7)"
```

---

## Task 7 (U8): Clean up ServiceContext — remove db field, simplify ctx.emit

**Files:**
- Modify: `src/shared/types/service-context.ts`
- Modify: `src/shared/events/event.ts` (if emit routing uses explicit tx)
- Modify: All callers of `ctx.emit(event, payload, getActiveTx())` → `ctx.emit(event, payload)`
- Modify: `src/shared/uploads/services/upload-core.service.ts` — heavy `ctx.db` usage

**Prerequisites:** Tasks 2–6 complete. All repositories use `getActiveTx()` internally.

- [ ] **Step 1: Audit ctx.db and ctx.emit usages**

```bash
grep -rn "ctx\.db\b" src/
grep -rn "ctx\.emit.*getActiveTx" src/
```

- [ ] **Step 2: Update service-context.ts — remove db field**

In `service-context.ts`:
1. Remove `db: typeof db` from `ServiceContext` interface
2. Update `emit` signature to remove optional `tx` param: `emit: <T extends Record<string, unknown>>(event: EventClass<T>, payload: T) => Promise<string>`
3. Update `createServiceContext` — remove `executor` param (or keep for backward compat during transition — see Step 4)
4. Update emit impl to use `getActiveTx()`:

```typescript
import { getActiveTx } from '@/shared/database/uow';

// In createServiceContext:
emit: (event, payload) => {
  const options: DispatchOptions = {
    actorId: userId,
    organizationId,
    tx: getActiveTx(),
  };
  const result = event.dispatch(payload, options);
  return result instanceof Promise ? result : Promise.resolve(result);
},
```

Remove `db: executor` from the returned object.

- [ ] **Step 3: Update upload-core.service.ts**

`src/shared/uploads/services/upload-core.service.ts` uses `ctx.db` extensively (15+ sites). Replace all `ctx.db` with `getActiveTx()`:

```typescript
import { getActiveTx } from '@/shared/database/uow';
// Replace: await uploadsRepository.findById(uploadId, ctx.db)
// With:    await uploadsRepository.findById(uploadId)
// (after uploadsRepository is also migrated to getActiveTx() — if not yet done in U7, do it here)
```

Check if `uploadsRepository` uses tx params:
```bash
grep -n "tx\b" src/shared/uploads/queries/uploads.repository.ts 2>/dev/null || \
  find src -path "*uploads*queries*" -name "*.ts" | head -3
```

If it does, apply same getActiveTx() transformation.

- [ ] **Step 4: Remove ctx.emit tx argument from all callers**

```bash
grep -rn "ctx\.emit(" src/ | grep "getActiveTx\|, tx\b"
```

For each hit, remove the third argument — emit now uses `getActiveTx()` internally.

- [ ] **Step 5: Clean up uow.ts if Tx export no longer needed externally**

```bash
grep -rn "import.*Tx.*from.*uow\b\|import type.*Tx.*from.*uow" src/
```

If `Tx` is still used by remaining callers (e.g. test files), keep the export. Otherwise remove it.

- [ ] **Step 6: Verify**

```bash
pnpm run typecheck
grep -r "DbOrTx\|ctx\.db\b" src/ | grep -v ".test.ts"
```

Expected: typecheck clean. `grep` returns zero matches.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/service-context.ts src/shared/events/event.ts \
        src/shared/uploads/ src/
git commit -m "refactor(uow): remove ctx.db and simplify ctx.emit to use getActiveTx() (U8)"
```

---

## Task 8 (U9): Update codemod for class-based repositories

**Files:**
- Modify: `scripts/codemod-readonly-repos.ts`

**Goal:** Update codemod to generate `getActiveTx()` pattern instead of read-only function exports with tx defaults.

- [ ] **Step 1: Read current codemod**

```bash
cat scripts/codemod-readonly-repos.ts
```

Understand what it currently generates.

- [ ] **Step 2: Update codemod to generate getActiveTx() pattern**

The new target output for any repository file should be:
1. Remove `tx` params from all function signatures
2. Replace `db.` / `tx.` usage with `getActiveTx().`
3. Remove `const client = tx ?? ...` intermediate variables
4. Add `import { getActiveTx } from '@/shared/database/uow'` if not present
5. Remove `import { db } from '@/shared/database'` if db was only used for transactions

Update the codemod to produce this output instead of the previous read-only approach.

- [ ] **Step 3: Verify codemod produces valid output**

Run codemod in dry-run mode on any remaining repository file that still has tx params:

```bash
pnpm tsx scripts/codemod-readonly-repos.ts --dry-run src/modules/payouts/database/queries/payouts.repository.ts
```

Expected: output shows `getActiveTx()` pattern, no tx params.

- [ ] **Step 4: Typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add scripts/codemod-readonly-repos.ts
git commit -m "refactor(uow): update codemod to generate getActiveTx() pattern (U9)"
```

---

## Verification Checklist (run after all tasks)

```bash
# Zero DbOrTx types remaining
grep -r "DbOrTx" src/ | wc -l  # expect: 0

# Zero ctx.db usages
grep -r "ctx\.db\b" src/ | wc -l  # expect: 0

# Zero tx params in service-context emit
grep -n "emit.*tx" src/shared/types/service-context.ts  # expect: 0 matches

# Zero explicit tx threading in query files (no "tx ?? db" or "tx ?? getActiveTx")
grep -r "tx ?? " src/ | wc -l  # expect: 0

# Zero Tx-suffix helpers
grep -rn "createMatterFromIntakeTx\|createMatterFromAcceptedContractTx" src/  # expect: 0

# Full typecheck
pnpm run typecheck

# Format check
pnpm run format:check
```

---

## Notes on Temporary State

- During Tasks 3–5, `usersRepository.update` still accepts `tx` param but callers stop passing it. It defaults to `db`. This is intentional — restored to ambient tx in Task 6 when usersRepository is migrated.
- `ctx.emit(Event, payload, getActiveTx())` pattern in Tasks 2–5 is a temporary bridge until Task 7 where emit uses `getActiveTx()` internally and the third arg is removed.
- `linkAnonymousUserData` tx pass-through in `clients-utils.ts` is cleaned up in Task 6 after `link-user-data.service.ts` is migrated.
