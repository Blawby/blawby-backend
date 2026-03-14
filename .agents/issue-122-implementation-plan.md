# Issue #122 — Complete Matter Billing Pipeline: Implementation Plan

> **Source:** [GitHub Issue #122](https://github.com/Blawby/blawby-ts/issues/122)
> **Modules affected:** `matters`, `invoices`, `trust`
> **Date:** 2026-03-14

---

## Current State Assessment

Nothing from the issue has been implemented yet. All 5 PRs are pending.

| PR | Check | Status |
|---|---|---|
| PR 1 | `getMatterById` (line 162) — no try/catch | ❌ Not done |
| PR 1 | `verifyMatterAccess` (line 146) — no try/catch | ❌ Not done |
| PR 2 | `unbilled.routes.ts` — file does not exist | ❌ Not done |
| PR 2 | `persistInvoiceStructure` (line 92) — no `markAsInvoiced` calls, no pro bono guard | ❌ Not done |
| PR 3 | `retainer_low_balance_threshold` column — not in `matters` schema | ❌ Not done |
| PR 3 | Trust routes — only 3 GET routes, no deposit/withdrawal | ❌ Not done |
| PR 3 | Webhook — no `trustService.recordDeposit` call | ❌ Not done |
| PR 4 | `settleMatterRoute` / `settleMatterHandler` — not found | ❌ Not done |
| PR 4 | Contingency validation in invoice creation — absent | ❌ Not done |
| PR 5 | `MilestoneCompleted` event — not defined | ❌ Not done |
| PR 5 | `updateMatterMilestone` — activity log for completion exists but no event emitted | ⚠️ Partial |
| PR 5 | `invoiced_at` / `invoice_id` in milestone response schemas — absent | ❌ Not done |

---

## PR Merge Order

```
PR 1  →  PR 2, PR 3, PR 4 (all in parallel, each depends only on PR 1)  →  PR 5 (depends on PR 2)
```

---

## Before You Start — Verify These Helpers Exist

Open each file and confirm these functions exist. The issue says to **reuse** them — do not rebuild.

| Helper | File | Line |
|---|---|---|
| `getUnbilled(matterId)` | `src/modules/matters/database/queries/matter-time-entries.queries.ts` | ~155 |
| `markAsInvoiced(ids, invoiceId, tx?)` | `src/modules/matters/database/queries/matter-time-entries.queries.ts` | ~119 |
| `getUnbilled(matterId)` | `src/modules/matters/database/queries/matter-expenses.queries.ts` | ~170 |
| `markAsInvoiced(ids, invoiceId, tx?)` | `src/modules/matters/database/queries/matter-expenses.queries.ts` | ~134 |
| `markAsInvoiced(milestoneId, invoiceId, tx?)` | `src/modules/matters/database/queries/matter-milestones.queries.ts` | ~139 |
| `updateRetainerBalance(matterId, amount)` | `src/modules/matters/database/queries/matters.queries.ts` | ~343 |
| `recordDeposit(...)` | `src/modules/trust/services/trust.service.ts` | — |
| `recordWithdrawal(...)` | `src/modules/trust/services/trust.service.ts` | — |
| `getBalance(...)` | `src/modules/trust/services/trust.service.ts` | — |
| `findByOrganizationId(organizationId)` | `src/modules/onboarding/database/queries/onboarding.repository.ts` | ~25 |

Also study the **existing `MatterCreated` event** pattern before writing any new events — find it in the matters listeners/events area and replicate the structure exactly.

---

## PR 1 — Hotfix: Fix `getMatterById` client mapping + type safety

> **Priority: merge immediately.**
>
> The global `errorHandler` (`src/shared/middleware/errorHandler.ts`) already catches uncaught DB exceptions, logs them with full request context (method, URL, requestId, userId, orgId), and returns a structured JSON 500. No try/catch needed in simple read functions — that would duplicate logging with less context.
>
> The real bug is a silent type lie: `client: true` in `findMatterByIdWithRelations` returns the raw `user_details` row (no `name`/`email`), but `MatterRecord.client` expects `{ id, name, email }`. An `as MatterRecord` cast was hiding the mismatch.

**Files:**
- `src/modules/matters/database/queries/matters.queries.ts`
- `src/modules/matters/services/matters.service.ts`

### Steps

1. **`findMatterByIdWithRelations`** — replace `client: true` with a nested relation that fetches `id` from `user_details` and traverses through to `users` for `name` and `email`:
   ```ts
   client: {
     columns: { id: true },
     with: { user: { columns: { name: true, email: true } } },
   }
   ```

2. **`getMatterById`** — remove the `as MatterRecord` cast, use `result.ok<MatterRecord>()` and map the nested shape flat:
   ```ts
   client: matter.client ? { id: matter.client.id, ...matter.client.user } : null
   ```

3. No try/catch needed — the global error handler covers unexpected DB failures for simple reads.

### Verify

```bash
pnpm run typecheck && pnpm run format:check
```

---

## PR 2 — Unbilled endpoint + wire `markAsInvoiced`

> **Depends on PR 1. Unblocks hourly billing end-to-end.**

### Step 1 — Create route file

Create **`src/modules/matters/routes/unbilled.routes.ts`**.

Model the structure on `src/modules/matters/routes/time-entries.routes.ts` — same `routeBuilder.build(...)` pattern. Route spec:

- Method: `GET`
- Path: `/{practice_id}/matters/{id}/unbilled`
- Params: `{ practice_id: z.uuid(), id: z.uuid() }`
- 200 response schema:
  ```
  {
    time_entries: array of { id, description, duration_minutes, hourly_rate, total, created_at, user_id? }
    expenses:     array of { id, description, amount, created_at }
    milestones:   array of { id, description, amount, status, due_date?, order }
    connected_account_id: uuid string or null
  }
  ```
  > **Do not remove `connected_account_id`** — the frontend needs it to open the invoice creation flow without an extra round-trip.
- Error responses: 403, 404, 500 — all using `errorResponseSchema`
- Import `z` from `@hono/zod-openapi`, **not** from `zod`
- Export the route as `getMatterUnbilledRoute`

### Step 2 — Export from route index

Open `src/modules/matters/routes/index.ts`. Import `getMatterUnbilledRoute` from the new file and add it to the exported `routes` object.

### Step 3 — Add handler

Open `src/modules/matters/handlers.ts`. Look at an existing handler (e.g. the time-entries handler) to understand the import/response pattern. Add `getMatterUnbilledHandler`:

1. Extract `ctx` via `getServiceContext(c)` and `matterId` from `c.req.valid('param').id`
2. Call `mattersService.verifyMatterAccess(matterId, ctx)` — if not successful, return `response.fromResult(c, accessResult)`
3. Inside a `try/catch`:
   - `Promise.all` for four queries in parallel:
     - `matterTimeEntriesQueries.getUnbilled(matterId)`
     - `matterExpensesQueries.getUnbilled(matterId)`
     - `matterMilestonesQueries.listByMatter(matterId)`
     - `onboardingRepository.findByOrganizationId(ctx.organizationId)`
   - Filter milestones: keep only those where `invoiced_at` is null **and** `status !== 'paid'`
   - Return `response.ok(c, { time_entries, expenses, milestones, connected_account_id: connectedAccount?.id ?? null })`
4. In the `catch`: log with `logger.error('Failed to get unbilled items {matterId}: {error}', ...)` and return `response.fromResult(c, result.internalError('Failed to load unbilled items'))`

Add these imports to `handlers.ts` if not already present:
- `matterTimeEntriesQueries`
- `matterExpensesQueries`
- `matterMilestonesQueries`
- `onboardingRepository`

### Step 4 — Register route

Open `src/modules/matters/http.ts`. Add one line following the existing `app.openapi(...)` pattern:

```
app.openapi(matterRoutes.getMatterUnbilledRoute, matterHandlers.getMatterUnbilledHandler);
```

### Step 5 — Wire `markAsInvoiced` into invoice creation

Open `src/modules/invoices/services/invoice-creation.service.ts`, find `persistInvoiceStructure` (line 92).

Inside the `db.transaction` callback, **after** `createInvoiceLineItems` and **before** `findInvoiceById`, add:

```
if time_entry_ids has items  → call matterTimeEntriesQueries.markAsInvoiced(time_entry_ids, newInvoice.id, tx)
if expense_ids has items     → call matterExpensesQueries.markAsInvoiced(expense_ids, newInvoice.id, tx)
if milestone_id is set       → call matterMilestonesQueries.markAsInvoiced(milestone_id, newInvoice.id, tx)
```

All three calls must be **inside the transaction** (`tx` as the last argument) so a rollback also reverts the invoiced marks.

The `data` object already carries `time_entry_ids`, `expense_ids`, and `milestone_id` — check the request schema at `src/modules/invoices/schemas/invoices.validation.ts:30` to confirm the field names.

Add imports at the top of `invoice-creation.service.ts`:
- `matterTimeEntriesQueries`
- `matterExpensesQueries`
- `matterMilestonesQueries`

### Step 6 — Pro bono guard

In the same `invoice-creation.service.ts`, find `validateInvoiceCreation`. Near the top of the function, **before any DB write**, add:

```
if matter exists and matter.billing_type === 'pro_bono'
  → return result.badRequest('Cannot create invoice for a pro bono matter')
```

You will need to fetch the matter here if `validateInvoiceCreation` doesn't already have it. Only fetch if `data.matter_id` is set.

### Verify

```bash
pnpm run typecheck && pnpm run format:check
```

---

## PR 3 — Retainer / Trust ledger consistency + per-matter threshold + manual adjustment routes

> **Depends on PR 1.**

### Step 1 — Add schema column

Open `src/modules/matters/database/schema/matters.schema.ts`. After the `retainer_balance` field (~line 57), add:

```
retainer_low_balance_threshold: integer('retainer_low_balance_threshold'),
```

No `.notNull()` — the column is nullable (NULL means no threshold configured). Value is stored in **cents**.

### Step 2 — Run migration

```bash
pnpm run db:generate
```

Review the generated SQL file to confirm it only adds the single column. Commit the migration file alongside the schema change.

### Step 3 — Expose in matter Zod schemas

Find the matter Zod schemas in `src/modules/matters/types/`. Add:

- **Create schema** (optional field): `retainer_low_balance_threshold: z.number().int().positive().nullable().optional()`
- **Update schema** (optional field): `retainer_low_balance_threshold: z.number().int().positive().nullable().optional()`
- **Response schema** (always returned): `retainer_low_balance_threshold: z.number().int().nullable()`

### Step 4 — Define `RetainerLowBalance` event

Find where `MatterCreated` is defined — look in `src/modules/matters/listeners.ts` or nearby. Following the exact same pattern, define:

```
RetainerLowBalance
  event name: 'matter.retainer_low_balance'
  payload: { matter_id, organization_id, current_balance, threshold }
```

Export it so it can be imported in the webhook service.

### Step 5 — Fix the webhook

Open `src/modules/invoices/services/invoice-webhooks.service.ts`, find `handleInvoicePaid`. Locate the block where `retainer_deposit` invoices are handled.

Replace or extend that block with the following sequence:

1. Call `trustService.recordDeposit(...)` with payload:
   ```
   organizationId, clientId, matterId, amount (invoice.amount_paid),
   invoiceId, stripePaymentIntentId, source: 'stripe_payment',
   description: `Retainer deposit — invoice ${invoice.invoice_number ?? invoice.id}`
   ```

2. Call `trustService.getBalance({ matterId: invoice.matter_id }, ctx)`. If successful, call `mattersQueries.updateRetainerBalance(invoice.matter_id, balanceResult.data.balance)` — **do not recalculate the balance inline**.

3. After syncing: fetch the matter with `mattersQueries.findMatterById(invoice.matter_id)`. If `retainer_low_balance_threshold` is set and non-zero and the current balance is below it, emit `RetainerLowBalance`.

### Step 6 — Add deposit route

Open `src/modules/trust/routes.ts`. Following the existing `getTrustBalanceRoute` pattern, add `trustDepositRoute`:

- Method: `POST`
- Path: `/{practice_id}/deposit`
- Body: `{ matter_id: z.uuid(), client_id: z.uuid(), amount: z.number().int().positive(), description: z.string() }`
- 200 response: the created `trust_transaction` record (use the already-exported `trustTransactionSchema`)
- 403, 500 error responses

### Step 7 — Add withdrawal route

Same as Step 6 but `trustWithdrawalRoute` at `/{practice_id}/withdrawal`. Note the additional constraint: withdrawal must be rejected if the resulting balance would go below 0.

### Step 8 — Add handlers

Open `src/modules/trust/handlers.ts`. Add `trustDepositHandler` and `trustWithdrawalHandler`:

**Deposit handler:**
1. Extract `ctx` and body
2. Call `trustService.recordDeposit(...)`
3. Sync `matters.retainer_balance` from `trustService.getBalance`
4. Check threshold — emit `RetainerLowBalance` if triggered
5. Return the created transaction record

**Withdrawal handler:**
1. Extract `ctx` and body
2. Call `trustService.getBalance` first — if `balance - amount < 0`, return `result.badRequest('Insufficient retainer balance')`
3. Call `trustService.recordWithdrawal(...)`
4. Sync `matters.retainer_balance` from `trustService.getBalance`
5. Check threshold — emit `RetainerLowBalance` if triggered
6. Return the created transaction record

### Step 9 — Register routes

Open `src/modules/trust/http.ts`. Add two `app.openapi(...)` registrations for the new routes.

### Verify

```bash
pnpm run typecheck && pnpm run format:check && pnpm run db:migrate
```

---

## PR 4 — Contingency settlement endpoint + invoice validation

> **Depends on PR 1.**

### Step 1 — Define the route

Open `src/modules/matters/routes/core.routes.ts`. Add `settleMatterRoute`:

- Method: `PATCH`
- Path: `/{practice_id}/matters/{id}/settle`
- Params: `{ practice_id: z.uuid(), id: z.uuid() }`
- Body: `{ settlement_amount: z.number().int().positive() }` (value in cents)
- 200 response: full matter object (reuse the existing matter response schema)
- 400 response: for wrong billing type or invalid amount
- 403 response: forbidden
- 404 response: matter not found

Export it in `src/modules/matters/routes/index.ts`.

### Step 2 — Add handler

Open `src/modules/matters/handlers.ts`. Add `settleMatterHandler`:

1. Extract `ctx`, `matterId` from params, `settlement_amount` from body
2. Call `mattersService.getMatterById(matterId, ctx)` — return early on failure
3. Guard: if `matter.billing_type !== 'contingency'` return `result.badRequest('Matter is not a contingency matter')`
4. Update `matters.settlement_amount` with the provided value — use the existing matter update query
5. Log matter activity: action `matter_settled`, metadata `{ settlement_amount, contingency_percentage: matter.contingency_percentage }` — follow the existing activity log pattern in the module
6. Return the updated matter
7. **Do not auto-create an invoice** — the attorney reviews first

Register in `src/modules/matters/http.ts`.

### Step 3 — Contingency validation in invoice creation

Open `src/modules/invoices/services/invoice-creation.service.ts`, find `validateInvoiceCreation`.

When `matter.billing_type === 'contingency'`:

1. If `matter.settlement_amount` is null or 0: return `result.badRequest('Settlement amount must be recorded before invoicing a contingency matter')`

2. If `data.line_items` is **not** provided or is empty: auto-generate a single line item:
   ```
   type: 'flat_fee'
   description: `Contingency fee (${contingency_percentage}% of $${(settlement_amount / 100).toFixed(2)} settlement)`
   unit_price: Math.round(settlement_amount * contingency_percentage / 100)
   quantity: 1
   ```

3. If `data.line_items` is explicitly provided: use them as-is (attorney discretion to override)

### Verify

```bash
pnpm run typecheck && pnpm run format:check
```

---

## PR 5 — `MilestoneCompleted` event + `invoiced_at` on milestone responses

> **Depends on PR 2 (so `markAsInvoiced` is wired and `invoiced_at` is being populated).**

### Step 1 — Define the event

Following the exact same pattern used for `RetainerLowBalance` (from PR 3), define `MilestoneCompleted`:

```
event name: 'matter.milestone_completed'
payload: { matter_id, milestone_id, organization_id, amount, description }
```

Export it from the same location so it can be imported in the milestones service.

### Step 2 — Emit the event

Open `src/modules/matters/services/matter-milestones.service.ts`, find `updateMatterMilestone` (line 126).

Around line 200, there is already a block that checks `params.data.status === 'completed' && milestone.status !== 'completed'` and logs a completion activity. **After** the activity log in that block, add:

```
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

Find the milestone Zod response schemas in `src/modules/matters/types/`. Add to the single milestone response object:

```
invoiced_at: z.string().datetime().nullable()
invoice_id:  z.uuid().nullable()
```

Check every route that returns milestone data and update each response schema:
- `listMatterMilestones` — each item in the array
- `createMatterMilestone` — single object response
- `updateMatterMilestone` — single object response
- `reorderMilestones` — only if it returns milestone objects

Also make sure each handler passes `invoiced_at` and `invoice_id` from the DB row through to the response. The `matter_milestones` table already has these columns (set by `markAsInvoiced` from PR 2).

### Verify

```bash
pnpm run typecheck && pnpm run format:check
```

---

## Final Checklist (after all PRs)

- [ ] `pnpm run typecheck` passes across the full codebase
- [ ] `pnpm run format:check` passes
- [ ] `pnpm run db:migrate` runs cleanly on staging
- [ ] **Manual test — hourly flow:** create matter → add time entries → `GET /unbilled` → create invoice → confirm `invoice_id` is set on time entry rows and unbilled count clears
- [ ] **Manual test — retainer flow:** trigger retainer deposit webhook → confirm row in `trust_transactions` and `matters.retainer_balance` matches `trustService.getBalance`
- [ ] **Manual test — pro bono guard:** attempt to create invoice for a pro bono matter → expect 400
- [ ] **Manual test — contingency:** set `settlement_amount` via `PATCH /settle` → create invoice without line items → confirm auto line item is generated
- [ ] **Manual test — milestone:** update milestone status to `completed` → confirm `MilestoneCompleted` event is emitted and `invoiced_at` appears on the response after invoicing
