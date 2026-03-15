# Issue #122 — Complete Matter Billing Pipeline: Implementation Plan

> **Source:** [GitHub Issue #122](https://github.com/Blawby/blawby-ts/issues/122)
> **Modules affected:** `matters`, `invoices`, `trust`
> **Date:** 2026-03-14

---

## Current State Assessment

| PR | Check | Status |
|---|---|---|
| PR 1 | `findMatterByIdWithRelations` — nested client relation | ✅ Done |
| PR 1 | `getMatterById` — typed mapping, no `as` cast | ✅ Done |
| PR 2 | `unbilled.routes.ts` + route index export | ✅ Done |
| PR 2 | Handler + service (`getMatterUnbilledHandler`, `getMatterUnbilled`) | ✅ Done |
| PR 2 | Registered in `http.ts` under `matterSubResources` | ✅ Done |
| PR 2 | `markAsInvoiced` wired in `persistInvoiceStructure` | ✅ Done |
| PR 2 | Pro bono guard in `validateInvoiceCreation` | ✅ Done |
| PR 3 | `retainer_low_balance_threshold` column — not in `matters` schema | ❌ Not done |
| PR 3 | Trust routes — no deposit/withdrawal | ❌ Not done |
| PR 3 | Webhook — no `trustService.recordDeposit` call | ❌ Not done |
| PR 4 | `settleMatterRoute` / `settleMatterHandler` — not found | ❌ Not done |
| PR 4 | Contingency validation in invoice creation — absent | ❌ Not done |
| PR 5 | `MilestoneCompleted` event — not defined | ❌ Not done |
| PR 5 | `updateMatterMilestone` — no event emitted on completion | ❌ Not done |
| PR 5 | `invoiced_at` / `invoice_id` in milestone response schemas — absent | ❌ Not done |

---

## PR Merge Order

```
PR 1 (done)  →  PR 2 (done), PR 3, PR 4  →  PR 5 (depends on PR 2)
```

---

## Architectural Decisions Made During PR 1 & PR 2

These decisions override the original issue spec where they conflict.

### No try/catch in service functions
The global `errorHandler` (`src/shared/middleware/errorHandler.ts`) catches all uncaught exceptions, logs them with full request context, and returns a structured 500. **Do not add try/catch in service functions** — it duplicates logging with less context and contradicts `TECH_DEBT_REMEDIATION_PLAN.md`. Drizzle rolls back transactions automatically on throw.

### Access control via `requireMatterAccess` middleware, not inside services
`src/shared/middleware/requireMatterAccess.ts` already exists and is applied to `matterSubResources.use('/:id/*', ...)` in `http.ts`. All matter sub-resource routes (including `/unbilled`) get `verifyMatterAccess` automatically — do not duplicate the check inside the service or handler.

### Schema cycle fix — relations in separate `*-relations.schema.ts` files
`matters.schema.ts` and `invoices.schema.ts` had a bidirectional import cycle that broke after `invoice-creation.service.ts` imported matter query modules. Fixed by moving all `relations()` definitions out of the table schema files into dedicated files:

| File | Contains |
|---|---|
| `src/modules/matters/database/schema/matters-relations.schema.ts` | `mattersRelations` |
| `src/modules/invoices/database/schema/invoices-relations.schema.ts` | `invoicesRelations` |
| `src/modules/invoices/database/schema/billing-transactions-relations.schema.ts` | `billingTransactionsRelations` |

**Rule going forward:** table definitions stay in `*.schema.ts`, cross-module `relations()` calls go in `*-relations.schema.ts`. The `sync:schemas` script (`pnpm run sync:schemas`) picks up `*-relations.schema.ts` files automatically — run it after creating new relation files.

### `time_entry_ids`, `expense_ids`, `milestone_id` must be destructured separately
In `persistInvoiceStructure`, these three fields must be explicitly destructured from `data` before the spread into `invoiceData`, otherwise they end up in the DB insert and cause errors:
```ts
const { line_items, time_entry_ids, expense_ids, milestone_id, ...invoiceData } = data;
```

---

## Before You Start — Verify These Helpers Exist

Open each file and confirm these functions exist. The issue says to **reuse** them — do not rebuild.

| Helper | File |
|---|---|
| `updateRetainerBalance(matterId, amount)` | `src/modules/matters/database/queries/matters.queries.ts` |
| `recordDeposit(...)` | `src/modules/trust/services/trust.service.ts` |
| `recordWithdrawal(...)` | `src/modules/trust/services/trust.service.ts` |
| `getBalance(...)` | `src/modules/trust/services/trust.service.ts` |

Also study the **existing `MatterCreated` event** pattern before writing any new events — find it in the matters listeners/events area and replicate the structure exactly.

---

## ~~PR 1 — Done~~ ✅

**What was done:**
- `findMatterByIdWithRelations` — `client: true` replaced with `client: { columns: { id: true }, with: { user: { columns: { name: true, email: true } } } }` using Drizzle's relational API
- `getMatterById` — `as MatterRecord` cast removed, uses `result.ok<MatterRecord>()` with `client: matter.client ? { id: matter.client.id, ...matter.client.user } : null`
- All try/catch removed from matters.service.ts — global handler covers unexpected errors

---

## ~~PR 2 — Done~~ ✅

**What was done:**
- `src/modules/matters/routes/unbilled.routes.ts` — `getMatterUnbilledRoute` defined
- Exported from `routes/index.ts`, registered on `matterSubResources` in `http.ts`
- `getMatterUnbilledHandler` in `handlers.ts` delegates to `mattersService.getMatterUnbilled`
- `getMatterUnbilled` service method — `Promise.all` for time entries, expenses, milestones, connected account; milestones filtered to `!invoiced_at && status !== 'paid'`
- `markAsInvoiced` wired in `persistInvoiceStructure` inside the transaction for `time_entry_ids`, `expense_ids`, `milestone_id`
- Pro bono guard added to `validateInvoiceCreation` after `validateMatterBelongsToClient`
- Dependency cycle between `matters.schema.ts` ↔ `invoices.schema.ts` fixed (see Architectural Decisions above)

---

## PR 3 — Retainer / Trust ledger consistency + per-matter threshold + manual adjustment routes

> **Depends on PR 1 (done).**

### Step 1 — Add schema column

Open `src/modules/matters/database/schema/matters.schema.ts`. After the `retainer_balance` field, add:

```ts
retainer_low_balance_threshold: integer('retainer_low_balance_threshold'),
```

No `.notNull()` — nullable means no threshold configured. Value in **cents**.

### Step 2 — Run migration

```bash
pnpm run db:generate
```

Review the generated SQL — confirm it only adds the one column. Commit the migration file alongside the schema change.

### Step 3 — Expose in matter Zod schemas

Find the matter Zod schemas in `src/modules/matters/types/`. Add:

- **Create schema** (optional): `retainer_low_balance_threshold: z.number().int().positive().nullable().optional()`
- **Update schema** (optional): `retainer_low_balance_threshold: z.number().int().positive().nullable().optional()`
- **Response schema** (always returned): `retainer_low_balance_threshold: z.number().int().nullable()`

### Step 4 — Define `RetainerLowBalance` event

Find where `MatterCreated` is defined. Following the exact same pattern, define and export:

```
RetainerLowBalance
  event name: 'matter.retainer_low_balance'
  payload: { matter_id, organization_id, current_balance, threshold }
```

### Step 5 — Fix the webhook

Open `src/modules/invoices/services/invoice-webhooks.service.ts`, find `handleInvoicePaid`. Locate the `retainer_deposit` block.

Replace/extend with this sequence:

1. Call `trustService.recordDeposit(...)`:
   ```
   organizationId, clientId, matterId, amount: invoice.amount_paid,
   invoiceId, stripePaymentIntentId, source: 'stripe_payment',
   description: `Retainer deposit — invoice ${invoice.invoice_number ?? invoice.id}`
   ```
2. Call `trustService.getBalance({ matterId: invoice.matter_id }, ctx)` → if successful, call `mattersQueries.updateRetainerBalance(invoice.matter_id, balanceResult.data.balance)` — **do not recalculate inline**
3. Fetch matter with `mattersQueries.findMatterById`. If `retainer_low_balance_threshold` is set, non-zero, and balance is below it → emit `RetainerLowBalance`

### Step 6 — Add deposit route

Open `src/modules/trust/routes.ts`. Add `trustDepositRoute`:

- Method: `POST`, Path: `/{practice_id}/deposit`
- Body: `{ matter_id: z.uuid(), client_id: z.uuid(), amount: z.number().int().positive(), description: z.string() }`
- 200: created `trust_transaction` record
- 403, 500 error responses

### Step 7 — Add withdrawal route

Same as Step 6 but `trustWithdrawalRoute` at `/{practice_id}/withdrawal`. Reject if resulting balance would go below 0.

### Step 8 — Add handlers

Open `src/modules/trust/handlers.ts`. Add `trustDepositHandler` and `trustWithdrawalHandler`.

**Deposit:** extract ctx + body → `recordDeposit` → sync balance from `getBalance` → check threshold → return transaction record.

**Withdrawal:** extract ctx + body → `getBalance` first (reject if `balance - amount < 0`) → `recordWithdrawal` → sync balance → check threshold → return transaction record.

### Step 9 — Register routes

Open `src/modules/trust/http.ts`. Add two `app.openapi(...)` registrations.

### Verify

```bash
pnpm run typecheck && pnpm run format:check && pnpm run db:migrate
```

---

## PR 4 — Contingency settlement endpoint + invoice validation

> **Depends on PR 1 (done).**

### Step 1 — Define the route

Open `src/modules/matters/routes/core.routes.ts`. Add `settleMatterRoute`:

- Method: `PATCH`, Path: `/{practice_id}/matters/{id}/settle`
- Params: `{ practice_id: z.uuid(), id: z.uuid() }`
- Body: `{ settlement_amount: z.number().int().positive() }` (cents)
- 200: full matter object (reuse existing matter response schema)
- 400: wrong billing type or invalid amount
- 403: forbidden, 404: not found

Export in `src/modules/matters/routes/index.ts`.

### Step 2 — Add handler

Open `src/modules/matters/handlers.ts`. Add `settleMatterHandler`:

1. Extract `ctx`, `matterId`, `settlement_amount`
2. Call `mattersService.getMatterById(matterId, ctx)` — return early on failure
3. Guard: if `matter.billing_type !== 'contingency'` → `result.badRequest('Matter is not a contingency matter')`
4. Update `matters.settlement_amount` via existing matter update query
5. Log activity: action `matter_settled`, metadata `{ settlement_amount, contingency_percentage: matter.contingency_percentage }`
6. Return updated matter — **do not auto-create an invoice**

Register in `src/modules/matters/http.ts`.

### Step 3 — Contingency validation in invoice creation

Open `src/modules/invoices/services/invoice-creation.service.ts`, find `validateInvoiceCreation`.

When `matter.billing_type === 'contingency'`:

1. If `matter.settlement_amount` is null or 0 → `result.badRequest('Settlement amount must be recorded before invoicing a contingency matter')`
2. If `data.line_items` is empty → auto-generate:
   ```
   type: 'flat_fee'
   description: `Contingency fee (${contingency_percentage}% of $${(settlement_amount / 100).toFixed(2)} settlement)`
   unit_price: Math.round(settlement_amount * contingency_percentage / 100)
   quantity: 1
   ```
3. If `data.line_items` is provided → use as-is

### Verify

```bash
pnpm run typecheck && pnpm run format:check
```

---

## PR 5 — `MilestoneCompleted` event + `invoiced_at` on milestone responses

> **Depends on PR 2 (done).**

### Step 1 — Define the event

Following the same pattern as `RetainerLowBalance` (PR 3), define and export `MilestoneCompleted`:

```
event name: 'matter.milestone_completed'
payload: { matter_id, milestone_id, organization_id, amount, description }
```

### Step 2 — Emit the event

Open `src/modules/matters/services/matter-milestones.service.ts`, find `updateMatterMilestone`.

Find the block that checks `params.data.status === 'completed' && milestone.status !== 'completed'`. After the activity log in that block, add:

```ts
await ctx.emit(MilestoneCompleted, {
  matter_id: matterId,
  milestone_id: params.milestoneId,
  organization_id: ctx.organizationId,
  amount: updated.amount,
  description: updated.description,
})
```

Import `MilestoneCompleted` at the top of the file.

### Step 3 — Add fields to milestone response schemas

Find milestone Zod response schemas in `src/modules/matters/types/`. Add to each:

```ts
invoiced_at: z.string().datetime().nullable()
invoice_id:  z.uuid().nullable()
```

Update every route that returns milestone data:
- `listMatterMilestones` — each array item
- `createMatterMilestone` — single response
- `updateMatterMilestone` — single response
- `reorderMilestones` — only if it returns milestone objects

Ensure handlers pass `invoiced_at` and `invoice_id` from the DB row through to the response.

### Verify

```bash
pnpm run typecheck && pnpm run format:check
```

---

## Final Checklist (after all PRs)

- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run format:check` passes
- [ ] `pnpm run sync:schemas` run after any new `*-relations.schema.ts` files added
- [ ] `pnpm run db:migrate` runs cleanly on staging
- [ ] **Manual test — hourly:** create matter → add time entries → `GET /unbilled` → create invoice → confirm `invoice_id` set on time entry rows and unbilled count clears
- [ ] **Manual test — retainer:** trigger retainer deposit webhook → confirm row in `trust_transactions` and `matters.retainer_balance` matches `trustService.getBalance`
- [ ] **Manual test — pro bono guard:** attempt invoice on pro bono matter → expect 400
- [ ] **Manual test — contingency:** `PATCH /settle` → create invoice without line items → confirm auto line item generated
- [ ] **Manual test — milestone:** update status to `completed` → confirm `MilestoneCompleted` emitted and `invoiced_at` appears after invoicing
