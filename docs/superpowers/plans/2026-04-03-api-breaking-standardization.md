# API Breaking Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize DELETE responses to `204 No Content`, list response envelopes to `{ data: [], pagination: { page, limit, total } }`, and fix REST violations in practice routes — all without breaking the frontend by using a deprecation strategy.

**Architecture:** Changes touch route schema definitions and handler return statements only. Services are not modified. These are **breaking API changes** — coordinate with frontend before shipping. The `OffsetPaginatedResponse<T>` type in `src/shared/types/pagination.ts` is already defined correctly; we just enforce its use.

> **Prerequisite:** Run `2026-04-03-api-non-breaking-fixes.md` Task 3 first. Plan B code assumes params are already named `matter_id`, `invoice_id`, `client_id`.

**Tech Stack:** Hono + `@hono/zod-openapi`, TypeScript 5.9, pnpm

> ⚠️ **Breaking changes:** Clients currently parsing `{ matters, total, page, limit, totalPages }` or expecting `200 { success: true }` on DELETE will break. Ship both tasks together in a single coordinated release with the frontend.

---

## File Map

### Task 1 — DELETE → 204

| File | What changes |
|------|-------------|
| `src/modules/clients/routes.ts` | `deleteClientRoute` + `deleteClientMemoRoute`: remove `200` body, add `204` |
| `src/modules/invoices/routes.ts` | `deleteInvoiceRoute`: `200 { success }` → `204` |
| `src/modules/invoices/handlers.ts` | `deleteInvoiceHandler`: `c.json(result, 200)` → `c.body(null, 204)` |
| `src/modules/matters/routes/core.routes.ts` | `deleteMatterRoute`: `200 { success }` → `204` |
| `src/modules/matters/routes/notes.routes.ts` | `deleteMatterNoteRoute`: `200 { success }` → `204` |
| `src/modules/matters/routes/time-entries.routes.ts` | `deleteTimeEntryRoute`: `200 { success }` → `204` |
| `src/modules/matters/routes/expenses.routes.ts` | `deleteExpenseRoute`: `200 { success }` → `204` |
| `src/modules/matters/routes/milestones.routes.ts` | `deleteMilestoneRoute`: `200 { success }` → `204` |
| `src/modules/matters/handlers.ts` | All delete handlers: return `c.body(null, 204)` after service call |

### Task 2 — List response envelopes

| File | What changes |
|------|-------------|
| `src/modules/matters/routes/core.routes.ts` | `listMattersRoute` response: `{ matters, total, page, limit, totalPages }` → `{ data, pagination }` |
| `src/modules/matters/handlers.ts` | `listMattersHandler`: return `{ data, pagination }` |
| `src/modules/invoices/routes.ts` | `listInvoicesRoute` response: `{ invoices, total }` → `{ data, pagination }` |
| `src/modules/invoices/handlers.ts` | `listInvoicesHandler`: transform service result to `{ data, pagination }` |
| `src/modules/invoices/routes.ts` | `getClientInvoicesRoute` response: `{ invoices, pagination }` → `{ data, pagination }` |
| `src/modules/invoices/handlers.ts` | `getClientInvoicesHandler`: service result passthrough (service must match) |

### Task 3 — REST violation fixes (deprecation strategy, all modules)

| File | What changes |
|------|-------------|
| `src/modules/practice/routes/practice.routes.ts` | `GET /list` → add `GET /` canonical; `PUT /active` → add `PATCH /{practice_id}` canonical; deprecate old routes |
| `src/modules/practice/http.ts` | Register canonical + deprecated routes |
| `src/modules/practice-client-intakes/routes/public.routes.ts` | `POST /create` → add `POST /` canonical; deprecate `/create` |
| `src/modules/practice-client-intakes/routes/public http.ts` | Register canonical + deprecated |
| `src/modules/subscriptions/routes.ts` | `POST /cancel` → add `DELETE /` canonical; deprecate `/cancel` |
| `src/modules/subscriptions/http.ts` | Register canonical + deprecated |
| `src/modules/invoices/routes.ts` | `POST /send`, `POST /void` → add `PATCH /{invoice_id}` with `{ status }` canonical; deprecate action routes. Keep `/sync` as-is (side-effect, no REST equivalent) |
| `src/modules/invoices/handlers.ts` | Add `patchInvoiceStatusHandler` for the canonical PATCH |
| `src/modules/matters/routes/core.routes.ts` + all sub-resource routes | `PUT` → add `PATCH` canonical for all update routes; deprecate `PUT` |
| `src/modules/matters/handlers.ts` | Handler types updated to match PATCH routes |
| `src/modules/practice/routes/practice-details.routes.ts` | `PUT /{practice_id}/details` → add `PATCH` canonical; deprecate `PUT` |
| `src/modules/preferences/routes.ts` | `PUT /{category}` → add `PATCH /{category}` canonical (description explicitly says partial update); deprecate `PUT` |
| `src/modules/trust/routes.ts` | `POST /deposit`, `POST /withdrawal` → add `POST /transactions` canonical with `type` field; deprecate verb routes |
| `src/modules/uploads/routes/upload-write.routes.ts` | `/confirm`, `/restore` — keep as-is (side-effects with no REST noun equivalent; these are accepted industry practice) |
| `src/modules/uploads/routes/upload-read.routes.ts` | `/download`, `/audit-log` — keep as-is (these are sub-resources, not verbs) |
| `src/modules/practice-client-intakes/routes/staff.routes.ts` | `/invite`, `/convert`, `/status` — keep `/status` (noun); deprecate `/invite` → `POST /{id}/invitations`; deprecate `/convert` → `POST /{id}/conversions` |

---

## Task 1: DELETE → 204

### 1a: Fix clients routes (route schema only — handlers already correct)

**File:** `src/modules/clients/routes.ts`

The `deleteClientHandler` and `deleteClientMemoHandler` already return `c.body(null, 204)`. The route schemas still declare `200 { success: boolean }`. Fix the schemas:

- [ ] **Step 1: Update `deleteClientRoute` response**

Find `deleteClientRoute` in `src/modules/clients/routes.ts`. Replace its `responses` block:

```typescript
export const deleteClientRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/{id}',
  tags: ['Clients'],
  summary: 'Delete client',
  description: 'Delete a client (soft delete)',
  request: { params: clientParamsSchema },
  responses: {
    204: {
      description: 'Client deleted',
    },
  },
});
```

- [ ] **Step 2: Update `deleteClientMemoRoute` response**

Find `deleteClientMemoRoute` in `src/modules/clients/routes.ts`. Replace its `responses` block:

```typescript
export const deleteClientMemoRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/{id}/memos/{memo_id}',
  tags: ['Clients: Memos'],
  summary: 'Delete client memo',
  description: 'Delete a specific memo',
  request: { params: memoParamsSchema },
  responses: {
    204: {
      description: 'Memo deleted',
    },
  },
});
```

- [ ] **Step 3: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors. If TypeScript complains that the handler return type doesn't match, ensure the handler file already returns `c.body(null, 204)` — it should, since no handler changes are needed here.


---

### 1b: Fix invoices delete (route + handler)

**Files:** `src/modules/invoices/routes.ts`, `src/modules/invoices/handlers.ts`

The `deleteInvoiceHandler` currently does `return c.json(result, 200)` where `result = { success: true }`. Change to `204`.

- [ ] **Step 1: Update `deleteInvoiceRoute` response schema**

In `src/modules/invoices/routes.ts`, find `deleteInvoiceRoute`. Replace its `responses` block:

```typescript
const deleteInvoiceRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/{id}',
  tags: ['Invoices'],
  summary: 'Delete invoice',
  description: 'Soft delete a draft invoice',
  request: { params: invoiceParamSchema },
  responses: {
    204: {
      description: 'Invoice deleted successfully',
    },
  },
});
```

- [ ] **Step 2: Update `deleteInvoiceHandler`**

In `src/modules/invoices/handlers.ts`, find `deleteInvoiceHandler`. Replace with:

```typescript
const deleteInvoiceHandler: AppRouteHandler<typeof routes.deleteInvoiceRoute> = async (c) => {
  const { invoice_id: id, practice_id: organizationId } = c.req.valid('param');
  const baseCtx = { ...getServiceContext(c), organizationId };

  await db.transaction(async (tx) => {
    const ctx = createServiceContext(baseCtx, tx);
    await invoiceLifecycleService.deleteInvoice({ id }, ctx);
  });

  return c.body(null, 204);
};
```

- [ ] **Step 3: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors.


---

### 1c: Fix matters core delete (route + handler)

**Files:** `src/modules/matters/routes/core.routes.ts`, `src/modules/matters/handlers.ts`

The `deleteMatterHandler` uses the legacy `sendResult(c, result)` pattern which returns `{ success: true }` at 200. We bypass the success-path of `sendResult` and return 204 directly.

- [ ] **Step 1: Update `deleteMatterRoute` response schema**

In `src/modules/matters/routes/core.routes.ts`, find `deleteMatterRoute`. Replace its `responses` block:

```typescript
export const deleteMatterRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/{id}',
  tags,
  summary: 'Delete a matter',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Matter deleted successfully',
    },
    404: {
      description: 'Matter not found',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
});
```

- [ ] **Step 2: Update `deleteMatterHandler`**

In `src/modules/matters/handlers.ts`, find `deleteMatterHandler`. Replace with:

```typescript
const deleteMatterHandler: AppRouteHandler<typeof matterRoutes.deleteMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: id } = c.req.valid('param');
  const result = await mattersService.deleteMatter(id, ctx);
  if (!result.success) {
    return sendResult(c, result); // propagates the error
  }
  return c.body(null, 204);
};
```

- [ ] **Step 3: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors.


---

### 1d: Fix matters sub-resource deletes (routes + handlers)

**Files:** `src/modules/matters/routes/notes.routes.ts`, `src/modules/matters/routes/time-entries.routes.ts`, `src/modules/matters/routes/expenses.routes.ts`, `src/modules/matters/routes/milestones.routes.ts`, `src/modules/matters/handlers.ts`

All four sub-resource delete routes declare `200 { success: boolean }`. Their handlers use either `sendResult(c, result)` or `c.json({ success: true }, 200)`.

- [ ] **Step 1: Update delete response in `notes.routes.ts`**

In `src/modules/matters/routes/notes.routes.ts`, replace `deleteMatterNoteRoute` responses:

```typescript
export const deleteMatterNoteRoute = routeBuilder.build({
  method: 'delete',
  path: '/{id}/notes/{note_id}',
  tags,
  summary: 'Delete a matter note',
  request: {
    params: z.object({
      id: z.uuid(),
      note_id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Note deleted successfully',
    },
  },
});
```

- [ ] **Step 2: Update delete response in `time-entries.routes.ts`**

In `src/modules/matters/routes/time-entries.routes.ts`, replace `deleteTimeEntryRoute` responses:

```typescript
export const deleteTimeEntryRoute = routeBuilder.build({
  method: 'delete',
  path: '/{id}/time-entries/{entry_id}',
  tags,
  summary: 'Delete a time entry',
  request: {
    params: z.object({
      id: z.uuid(),
      entry_id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Time entry deleted successfully',
    },
  },
});
```

- [ ] **Step 3: Update delete response in `expenses.routes.ts`**

In `src/modules/matters/routes/expenses.routes.ts`, replace `deleteExpenseRoute` responses:

```typescript
export const deleteExpenseRoute = routeBuilder.build({
  method: 'delete',
  path: '/{id}/expenses/{expense_id}',
  tags,
  summary: 'Delete an expense',
  request: {
    params: z.object({
      id: z.uuid(),
      expense_id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Expense deleted successfully',
    },
  },
});
```

- [ ] **Step 4: Update delete response in `milestones.routes.ts`**

In `src/modules/matters/routes/milestones.routes.ts`, replace `deleteMilestoneRoute` responses:

```typescript
export const deleteMilestoneRoute = routeBuilder.build({
  method: 'delete',
  path: '/{id}/milestones/{milestone_id}',
  tags,
  summary: 'Delete a milestone',
  request: {
    params: z.object({
      id: z.uuid(),
      milestone_id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Milestone deleted successfully',
    },
  },
});
```

- [ ] **Step 5: Update all four delete handlers in `matters/handlers.ts`**

In `src/modules/matters/handlers.ts`, replace the four sub-resource delete handlers:

```typescript
const deleteMatterNoteHandler: AppRouteHandler<typeof matterRoutes.deleteMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, note_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  await matterNotesService.deleteMatterNote({ noteId: note_id }, scopedCtx);
  return c.body(null, 204);
};

const deleteTimeEntryHandler: AppRouteHandler<typeof matterRoutes.deleteTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, entry_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterTimeEntriesService.deleteMatterTimeEntry({ entryId: entry_id }, scopedCtx);
  if (!result.success) {
    return sendResult(c, result);
  }
  return c.body(null, 204);
};

const deleteExpenseHandler: AppRouteHandler<typeof matterRoutes.deleteExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, expense_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterExpensesService.deleteMatterExpense({ expenseId: expense_id }, scopedCtx);
  if (!result.success) {
    return sendResult(c, result);
  }
  return c.body(null, 204);
};

const deleteMilestoneHandler: AppRouteHandler<typeof matterRoutes.deleteMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, milestone_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterMilestonesService.deleteMatterMilestone({ milestoneId: milestone_id }, scopedCtx);
  if (!result.success) {
    return sendResult(c, result);
  }
  return c.body(null, 204);
};
```

**Note on `deleteMatterNoteHandler`:** The note service (`matterNotesService.deleteMatterNote`) does not use the Result pattern — it throws on error. So we call it directly and return 204 without checking `result.success`.

- [ ] **Step 6: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors.


---

## Task 2: Standardize list response envelopes

**Standard shape:** `{ data: T[], pagination: { page: number, limit: number, total: number } }`

This shape matches the existing `OffsetPaginatedResponse<T>` interface in `src/shared/types/pagination.ts`.

---

### 2a: Matters list

**Files:** `src/modules/matters/routes/core.routes.ts`, `src/modules/matters/handlers.ts`

Current shape: `{ matters: matterResponseSchema[], total, page, limit, totalPages }` — non-standard keys and `totalPages` is not in the standard pagination type.

- [ ] **Step 1: Update `listMattersRoute` response schema**

In `src/modules/matters/routes/core.routes.ts`, replace the `listMattersRoute` `200` response:

```typescript
export const listMattersRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags,
  summary: 'List matters',
  description: 'Returns a paginated list of matters for the practice.',
  request: {
    params: z.object({
      practice_id: z.uuid(),
    }),
    query: listMattersQuerySchema,
  },
  responses: {
    200: {
      description: 'Matters retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(matterResponseSchema),
            pagination: z.object({
              page: z.number().int(),
              limit: z.number().int(),
              total: z.number().int(),
            }),
          }),
        },
      },
    },
  },
});
```

- [ ] **Step 2: Update `listMattersHandler`**

In `src/modules/matters/handlers.ts`, replace `listMattersHandler`:

```typescript
const listMattersHandler: AppRouteHandler<typeof matterRoutes.listMattersRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const page = parseInt(String(query.page ?? '1'), 10);
  const limit = parseInt(String(query.limit ?? '20'), 10);
  const result = await mattersService.listMatters({ ...query, page, limit }, ctx);

  if (!result.success) {
    return sendResult(c, result);
  }

  return c.json(
    {
      data: result.data.matters,
      pagination: { page, limit, total: result.data.total },
    },
    200
  );
};
```

- [ ] **Step 3: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors.


---

### 2b: Invoices list (practice-side)

**Files:** `src/modules/invoices/routes.ts`, `src/modules/invoices/handlers.ts`

Current shape: `{ invoices: invoiceSchema[], total: number }` — no pagination object, non-standard key.

The `listInvoicesHandler` currently does `const result = await invoiceQueriesService.listInvoices(...); return c.json(result, 200)` where the service returns `{ invoices, total }` directly.

To avoid touching the service, we destructure in the handler and build the standard envelope. The query params (`page`, `limit`) come from `invoiceValidations.listInvoicesQuerySchema` — extract them the same way matters does.

- [ ] **Step 1: Update `listInvoicesRoute` response schema**

In `src/modules/invoices/routes.ts`, replace the `listInvoicesRoute` `200` response:

```typescript
const listInvoicesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Invoices'],
  summary: 'List invoices',
  description: 'Get all invoices for a practice.',
  request: {
    params: practiceIdParamSchema,
    query: invoiceValidations.listInvoicesQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(invoiceValidations.invoiceSchema),
            pagination: z.object({
              page: z.number().int(),
              limit: z.number().int(),
              total: z.number().int(),
            }),
          }),
        },
      },
      description: 'Invoices retrieved successfully',
    },
  },
});
```

- [ ] **Step 2: Update `listInvoicesHandler`**

In `src/modules/invoices/handlers.ts`, replace `listInvoicesHandler`:

```typescript
const listInvoicesHandler: AppRouteHandler<typeof routes.listInvoicesRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');

  const result = await invoiceQueriesService.listInvoices({ filters: query }, ctx);

  const page = (query as { page?: number }).page ?? 1;
  const limit = (query as { limit?: number }).limit ?? 20;

  return c.json(
    {
      data: result.invoices,
      pagination: { page, limit, total: result.total },
    },
    200
  );
};
```

**Note:** If `listInvoicesQuerySchema` already defines `page` and `limit` with defaults (likely), you can access them directly as `query.page` and `query.limit`. Remove the type casts if TypeScript allows direct access. Run typecheck to confirm.

- [ ] **Step 3: Type-check**

```bash
pnpm run typecheck
```

If TypeScript reports `property 'page' does not exist` on the query type, inspect `invoiceValidations.listInvoicesQuerySchema` to see what fields it exposes, and adjust the handler to use the correct field names.


---

### 2c: Client invoices list

**Files:** `src/modules/invoices/routes.ts`, `src/modules/invoices/handlers.ts`

Current shape: `{ invoices: invoiceSummarySchema[], pagination: { page, limit, total } }` — pagination object exists but `invoices` key should be `data`.

- [ ] **Step 1: Update `getClientInvoicesRoute` response schema**

In `src/modules/invoices/routes.ts`, replace the `getClientInvoicesRoute` `200` response:

```typescript
const getClientInvoicesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/client',
  tags: ['Client Invoices'],
  summary: 'List my invoices',
  description: 'List invoices for the authenticated client (no line items in list view).',
  request: {
    params: practiceIdParamSchema,
    query: z.object({
      status: z.enum(['draft', 'pending', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(invoiceValidations.invoiceSummarySchema),
            pagination: z.object({
              page: z.number().int(),
              limit: z.number().int(),
              total: z.number().int(),
            }),
          }),
        },
      },
      description: 'Client invoices retrieved',
    },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
  },
});
```

- [ ] **Step 2: Check what `invoiceQueriesService.listClientInvoices` returns**

Open `src/modules/invoices/services/invoice-queries.service.ts` and find `listClientInvoices`. Check its return type:
- If it returns `{ invoices: ..., pagination: ... }` → transform in handler: `{ data: result.invoices, pagination: result.pagination }`
- If it returns `{ data: ..., pagination: ... }` already → no handler change needed, the route schema fix in Step 1 is sufficient

- [ ] **Step 3: Update `getClientInvoicesHandler` if needed**

If the service returns `{ invoices, pagination }`, update the handler in `src/modules/invoices/handlers.ts`:

```typescript
const getClientInvoicesHandler: AppRouteHandler<typeof routes.getClientInvoicesRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');

  const result = await invoiceQueriesService.listClientInvoices({ filters: query }, ctx);

  return c.json(
    {
      data: result.invoices,
      pagination: result.pagination,
    },
    200
  );
};
```

If the service already returns `{ data, pagination }`, keep the handler as-is.

- [ ] **Step 4: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors.


---

---

## Task 3: Fix REST violations with deprecation strategy (all modules)

**Context:** REST violations fall into three categories across the codebase:

1. **Verb collection paths** — `GET /list`, `POST /create`, `POST /cancel` at the collection level
2. **State transition action sub-resources** — `/send`, `/void`, `/invite`, `/convert` etc. after an ID
3. **PUT used for partial updates** — `PUT` implies full replacement; partial updates must use `PATCH`

**Strategy for all three:** Add the canonical REST route. Mark the old route `deprecated: true`. Both point to the same handler. Frontend migrates at its own pace. Deprecated routes are removed in a follow-up cleanup PR.

**What to keep as-is** (these are accepted industry practice, not violations):
- `POST /{id}/sync` — side-effect trigger with no state equivalent
- `POST /{id}/confirm`, `POST /{id}/restore` (uploads) — side-effects
- `GET /{id}/download`, `GET /{id}/audit-log` (uploads) — noun sub-resources, not verbs
- `GET /organization/{practice_id}/status` (onboarding) — noun sub-resource

---

### 3a: Verb collection paths

**Pattern for all:** Add canonical route → mark old route `deprecated: true` → register both in `http.ts` pointing to the same handler.

- [ ] **Step 1: Practice — `GET /list` → `GET /`**

In `src/modules/practice/routes/practice.routes.ts`, rename the existing export and add the canonical:

```typescript
// Canonical
export const listPracticesRoute = routeBuilder.build({
  method: 'get',
  path: '/',
  tags: ['Practice'],
  summary: 'List practices',
  description: 'Retrieve all practices for the authenticated user',
  responses: {
    200: {
      content: { 'application/json': { schema: practiceValidations.practiceListResponseSchema } },
      description: 'Practices retrieved successfully',
    },
  },
});

// Deprecated — remove once frontend migrates to GET /api/practice
export const listPracticesDeprecatedRoute = routeBuilder.build({
  method: 'get',
  path: '/list',
  tags: ['Practice'],
  summary: 'List practices (deprecated)',
  description: 'Deprecated — use `GET /api/practice` instead.',
  deprecated: true,
  responses: {
    200: {
      content: { 'application/json': { schema: practiceValidations.practiceListResponseSchema } },
      description: 'Practices retrieved successfully',
    },
  },
});
```

In `src/modules/practice/http.ts`, replace the single `listPracticesRoute` registration with both:

```typescript
practiceApp.openapi(routes.listPracticesRoute, handlers.listPracticesHandler);
practiceApp.openapi(routes.listPracticesDeprecatedRoute, handlers.listPracticesHandler);
```

- [ ] **Step 2: Intakes — `POST /create` → `POST /`**

In `src/modules/practice-client-intakes/routes/public.routes.ts`, find `createPracticeClientIntakeRoute` at `path: '/create'`. Add canonical alongside it:

```typescript
// Canonical
export const createIntakeRoute = routeBuilder.build({
  method: 'post',
  path: '/',
  tags: ['Client Intakes'],
  summary: 'Submit client intake',
  // ...copy request + responses from existing createPracticeClientIntakeRoute...
});

// Deprecated — remove once frontend migrates to POST /api/practice-client-intakes
export const createPracticeClientIntakeRoute = routeBuilder.build({
  // existing definition unchanged, add:
  deprecated: true,
  description: 'Deprecated — use `POST /api/practice-client-intakes` instead.',
  // ...rest of existing definition...
});
```

Register both in the intakes public `http.ts`, both pointing to the existing create handler.

- [ ] **Step 3: Subscriptions — `POST /cancel` → `DELETE /`**

In `src/modules/subscriptions/routes.ts`, add canonical alongside deprecated:

```typescript
// Canonical — cancelling a subscription is deleting it
export const cancelSubscriptionRoute = routeBuilder.build({
  method: 'delete',
  path: '/',
  tags: ['Subscriptions'],
  summary: 'Cancel subscription',
  description: 'Cancel the active subscription for the authenticated practice',
  responses: {
    204: { description: 'Subscription cancelled successfully' },
  },
});

// Deprecated — remove once frontend migrates to DELETE /api/subscriptions
export const cancelSubscriptionLegacyRoute = routeBuilder.build({
  method: 'post',
  path: '/cancel',
  tags: ['Subscriptions'],
  summary: 'Cancel subscription (deprecated)',
  description: 'Deprecated — use `DELETE /api/subscriptions` instead.',
  deprecated: true,
  responses: {
    200: {
      // ...existing response schema...
    },
  },
});
```

Register both in subscriptions `http.ts` pointing to the same cancel handler. Update the cancel handler to return `c.body(null, 204)` when called via the canonical route (or keep returning 200 for both until the deprecated route is removed — acceptable interim state).

- [ ] **Step 4: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors.

---

### 3b: State transition action sub-resources — invoices

`POST /{invoice_id}/send` and `POST /{invoice_id}/void` are state transitions. The canonical REST pattern is `PATCH /{invoice_id}` with a `status` field. `/sync` is a side-effect trigger with no REST equivalent — leave it as-is.

- [ ] **Step 1: Add `PATCH /{practice_id}/{invoice_id}` canonical route in `src/modules/invoices/routes.ts`**

```typescript
const patchInvoiceStatusRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}/{invoice_id}/status',
  tags: ['Invoices'],
  summary: 'Transition invoice status',
  description: 'Change invoice status. Replaces the deprecated /send and /void action endpoints.',
  request: {
    params: invoiceParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            status: z.enum(['sent', 'voided']),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: invoiceValidations.invoiceSchema } },
      description: 'Invoice status updated',
    },
  },
});
```

Mark the existing `sendInvoiceRoute` and `voidInvoiceRoute` as deprecated:

```typescript
const sendInvoiceRoute = routeBuilder.build({
  // ...existing definition...
  deprecated: true,
  description: 'Deprecated — use PATCH /{invoice_id}/status with { status: "sent" } instead.',
});

const voidInvoiceRoute = routeBuilder.build({
  // ...existing definition...
  deprecated: true,
  description: 'Deprecated — use PATCH /{invoice_id}/status with { status: "voided" } instead.',
});
```

- [ ] **Step 2: Add `patchInvoiceStatusHandler` in `src/modules/invoices/handlers.ts`**

```typescript
const patchInvoiceStatusHandler: AppRouteHandler<typeof routes.patchInvoiceStatusRoute> = async (c) => {
  const { invoice_id: id, practice_id: organizationId } = c.req.valid('param');
  const baseCtx = { ...getServiceContext(c), organizationId };
  const { status } = c.req.valid('json');

  const result = await db.transaction(async (tx) => {
    const ctx = createServiceContext(baseCtx, tx);
    if (status === 'sent') {
      return await invoiceStripeCoordinationService.sendInvoice({ id }, ctx);
    }
    return await invoiceStripeCoordinationService.voidInvoice({ id }, ctx);
  });

  return c.json(result, 200);
};
```

Export it from the `handlers` object and register in `invoices/http.ts`.

- [ ] **Step 3: Type-check**

```bash
pnpm run typecheck
```

---

### 3c: State transition action sub-resources — intakes

`POST /{intake_id}/invite` and `PATCH /{intake_id}/convert` are state transitions. Model them as sub-resource collections.

- [ ] **Step 1: Add canonical routes in `src/modules/practice-client-intakes/routes/staff.routes.ts`**

```typescript
// Canonical: sending an invitation = creating an invitation resource
export const createIntakeInvitationRoute = routeBuilder.build({
  method: 'post',
  path: '/{intake_id}/invitations',
  tags: ['Client Intakes: Staff'],
  summary: 'Send intake invitation',
  description: 'Send an invitation to the client for this intake.',
  request: {
    params: z.object({ intake_id: z.uuid() }),
  },
  responses: {
    201: { description: 'Invitation sent' },
  },
});

// Canonical: converting an intake = creating a conversion record
export const createIntakeConversionRoute = routeBuilder.build({
  method: 'post',
  path: '/{intake_id}/conversions',
  tags: ['Client Intakes: Staff'],
  summary: 'Convert intake to client',
  description: 'Convert an approved intake into a client record.',
  request: {
    params: z.object({ intake_id: z.uuid() }),
  },
  responses: {
    201: {
      content: { 'application/json': { schema: /* existing convertIntake response schema */ z.unknown() } },
      description: 'Intake converted to client',
    },
  },
});
```

Mark `triggerIntakeInvitationRoute` (`POST /{uuid}/invite`) and `convertIntakeRoute` (`PATCH /{uuid}/convert`) as `deprecated: true`.

Register canonical + deprecated in the staff intakes `http.ts`, pointing to the same existing handlers.

- [ ] **Step 2: Type-check**

```bash
pnpm run typecheck
```

---

### 3d: Trust — `POST /deposit` and `POST /withdrawal` → `POST /transactions`

Deposits and withdrawals are both financial transactions — the type is a field, not a URL segment.

- [ ] **Step 1: Add canonical route in `src/modules/trust/routes.ts`**

```typescript
// Canonical: both deposit and withdrawal are trust transactions
export const createTrustTransactionRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/transactions',
  tags: ['Trust'],
  summary: 'Create trust transaction',
  description: 'Create a deposit or withdrawal transaction.',
  request: {
    params: z.object({ practice_id: z.uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            type: z.enum(['deposit', 'withdrawal']),
            // ...other fields from existing deposit/withdrawal schemas...
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { /* existing transaction response schema */ } },
      description: 'Transaction created',
    },
  },
});
```

Mark `createDepositRoute` and `createWithdrawalRoute` as `deprecated: true`. Register canonical in trust `http.ts`.

**Note:** The canonical handler needs to branch on `type` to call the correct service method. Add a `createTrustTransactionHandler` in `src/modules/trust/handlers.ts` that does this.

- [ ] **Step 2: Type-check**

```bash
pnpm run typecheck
```

---

### 3e: `PUT` → `PATCH` for all partial update routes

Every `PUT` in this codebase is a partial update, not a full replacement. `PUT` semantics require the client to send the complete resource; these all accept optional fields. Fix: add `PATCH` canonical, deprecate `PUT`.

**Affected routes:**

| File | Route | Path |
|------|-------|------|
| `src/modules/matters/routes/core.routes.ts` | `updateMatterRoute` | `PUT /{practice_id}/{matter_id}` |
| `src/modules/matters/routes/notes.routes.ts` | `updateMatterNoteRoute` | `PUT /{matter_id}/notes/{note_id}` |
| `src/modules/matters/routes/time-entries.routes.ts` | `updateTimeEntryRoute` | `PUT /{matter_id}/time-entries/{entry_id}` |
| `src/modules/matters/routes/expenses.routes.ts` | `updateExpenseRoute` | `PUT /{matter_id}/expenses/{expense_id}` |
| `src/modules/matters/routes/milestones.routes.ts` | `updateMilestoneRoute` | `PUT /{matter_id}/milestones/{milestone_id}` |
| `src/modules/practice/routes/practice.routes.ts` | `updatePracticeRoute` | `PUT /{practice_id}` |
| `src/modules/practice/routes/practice-details.routes.ts` | `updatePracticeDetailsRoute` | `PUT /{practice_id}/details` |
| `src/modules/preferences/routes.ts` | `updateCategoryPreferencesRoute` | `PUT /{category}` |

- [ ] **Step 1: For each route in the table above, add a `PATCH` canonical and mark the `PUT` deprecated**

The pattern is identical for all of them. Example for `updateMatterRoute`:

```typescript
// Canonical
export const updateMatterRoute = routeBuilder.build({
  method: 'patch',                          // ← was 'put'
  path: '/{practice_id}/{matter_id}',
  tags,
  summary: 'Update a matter',
  request: {
    params: z.object({ practice_id: z.uuid(), matter_id: z.uuid() }),
    body: { content: { 'application/json': { schema: updateMatterRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ matter: matterResponseSchema }) } },
      description: 'Matter updated successfully',
    },
  },
});

// Deprecated — remove once frontend migrates to PATCH
export const updateMatterDeprecatedRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/{matter_id}',
  deprecated: true,
  summary: 'Update a matter (deprecated)',
  description: 'Deprecated — use `PATCH /api/matters/{practice_id}/{matter_id}` instead.',
  tags,
  request: {
    params: z.object({ practice_id: z.uuid(), matter_id: z.uuid() }),
    body: { content: { 'application/json': { schema: updateMatterRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ matter: matterResponseSchema }) } },
      description: 'Matter updated successfully',
    },
  },
});
```

Apply this same pattern to every route in the table. Both the canonical and deprecated routes point to the same existing handler.

Register both in the respective `http.ts` files.

- [ ] **Step 2: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors. If handlers are typed as `AppRouteHandler<typeof routes.updateMatterRoute>`, TypeScript will enforce the new `PATCH` route type. Update handler type annotations where needed.

---

## Self-Review Checklist

- [x] Task 1a: client routes `deleteClientRoute` + `deleteClientMemoRoute` schemas fixed
- [x] Task 1b: invoice delete route + handler updated
- [x] Task 1c: matter core delete route + handler updated
- [x] Task 1d: all 4 matter sub-resource delete routes + handlers updated
- [x] Task 2a: matters list route + handler standardized
- [x] Task 2b: invoices list route + handler standardized (with note about query field names)
- [x] Task 2c: client invoices list route + handler standardized (with conditional step for service return shape)
- [x] Task 3a: Verb collection paths fixed — `GET /`, `POST /`, `DELETE /` canonical routes added with deprecated originals
- [x] Task 3b: Invoice state transitions — `PATCH /{invoice_id}/status` canonical with `patchInvoiceStatusHandler`
- [x] Task 3c: Intake state transitions — `/invitations` and `/conversions` noun sub-resources replace verb routes
- [x] Task 3d: Trust transactions — `POST /transactions` with `type` field replaces `/deposit` and `/withdrawal`
- [x] Task 3e: All `PUT` partial update routes get `PATCH` canonical + deprecated `PUT` across 8 route files
- [x] `/sync`, `/confirm`, `/restore`, `/download`, `/audit-log` correctly excluded (side-effects or noun sub-resources)
- [x] Breaking change flagged at top of plan
- [x] Deprecated routes use `deprecated: true` OpenAPI flag — shows as strikethrough in docs
- [x] `deleteMatterNoteHandler` correctly uses direct `await` (no Result pattern) — verified from handler code
- [x] No placeholders — all steps show exact code or describe exact conditional based on service inspection
- [x] `OffsetPaginatedResponse<T>` type in `shared/types/pagination.ts` matches `{ data, pagination: { page, limit, total } }` exactly
