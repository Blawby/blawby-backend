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

### Task 3 — REST violation fixes (deprecation strategy)

| File | What changes |
|------|-------------|
| `src/modules/practice/routes/practice.routes.ts` | Add `GET /` as `listPracticesRoute`; rename old to `listPracticesDeprecatedRoute` with `deprecated: true`; add `PATCH /{practice_id}` as `setActivePracticeRoute`; rename old to `setActivePracticeDeprecatedRoute` with `deprecated: true` |
| `src/modules/practice/http.ts` | Register both canonical + deprecated routes pointing to same handlers |

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

## Task 3: Fix REST violations with deprecation strategy

**Files:**
- Modify: `src/modules/practice/routes/practice.routes.ts`
- Modify: `src/modules/practice/routes/index.ts`
- Modify: `src/modules/practice/http.ts`

**Context:** Two routes violate REST principles:
1. `GET /list` — verb in URL; collection should be `GET /`
2. `PUT /{practice_id}/active` — verb sub-resource; active state is a field, not a resource

**Strategy:** Add canonical REST routes alongside the existing ones. Mark old routes `deprecated: true` in OpenAPI (shows as strikethrough in docs). Both old and new routes call the **same handler** — zero logic duplication. Frontend migrates at its own pace, then deprecated routes are removed in a follow-up PR.

---

### 3a: Add `GET /` alongside deprecated `GET /list`

- [ ] **Step 1: Update `src/modules/practice/routes/practice.routes.ts`**

Add the canonical route and mark the old one deprecated. Rename the old export so the canonical one gets the clean name:

```typescript
// Canonical REST endpoint — new name, clean path
export const listPracticesRoute = routeBuilder.build({
  method: 'get',
  path: '/',
  tags: ['Practice'],
  summary: 'List practices',
  description: 'Retrieve all practices for the authenticated user',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceListResponseSchema,
        },
      },
      description: 'Practices retrieved successfully',
    },
  },
});

// Kept for backwards compatibility — remove once frontend migrates to GET /
export const listPracticesDeprecatedRoute = routeBuilder.build({
  method: 'get',
  path: '/list',
  tags: ['Practice'],
  summary: 'List practices (deprecated)',
  description: 'Deprecated — use `GET /api/practice` instead.',
  deprecated: true,
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceListResponseSchema,
        },
      },
      description: 'Practices retrieved successfully',
    },
  },
});
```

- [ ] **Step 2: Export the new route from `src/modules/practice/routes/index.ts`**

The file currently does `export * from './practice.routes'`. Since we renamed the old export and added a new one, the barrel re-export picks up both automatically — no change needed here. Verify by checking the file.

- [ ] **Step 3: Register both routes in `src/modules/practice/http.ts`**

Add the new canonical route registration. Both call `handlers.listPracticesHandler`:

```typescript
/**
 * GET /api/practice
 * List all practices for the authenticated user (canonical REST endpoint)
 */
practiceApp.openapi(routes.listPracticesRoute, handlers.listPracticesHandler);

/**
 * GET /api/practice/list
 * @deprecated — use GET /api/practice instead
 */
practiceApp.openapi(routes.listPracticesDeprecatedRoute, handlers.listPracticesHandler);
```

Replace the existing `practiceApp.openapi(routes.listPracticesRoute, ...)` line with both of the above.

- [ ] **Step 4: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors.

---

### 3b: Add `PATCH /{practice_id}` with `is_active` alongside deprecated `PUT /{practice_id}/active`

The canonical REST way to set a practice as active is a partial update: `PATCH /{practice_id}` with body `{ is_active: true }`. The existing `PUT /{practice_id}/active` stays but is marked deprecated.

- [ ] **Step 1: Add the canonical route in `src/modules/practice/routes/practice.routes.ts`**

```typescript
// Canonical REST endpoint for setting active practice
export const setActivePracticeRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}',
  tags: ['Practice'],
  summary: 'Set active practice',
  description: 'Set a practice as the active practice for the authenticated user',
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            is_active: z.literal(true),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.setActivePracticeResponseSchema,
        },
      },
      description: 'Practice set as active successfully',
    },
  },
});

// Kept for backwards compatibility — remove once frontend migrates to PATCH /{practice_id}
export const setActivePracticeDeprecatedRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/active',
  tags: ['Practice'],
  summary: 'Set active practice (deprecated)',
  description: 'Deprecated — use `PATCH /api/practice/{practice_id}` with body `{ is_active: true }` instead.',
  deprecated: true,
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.setActivePracticeResponseSchema,
        },
      },
      description: 'Practice set as active successfully',
    },
  },
});
```

- [ ] **Step 2: Register both routes in `src/modules/practice/http.ts`**

Replace the existing `setActivePracticeRoute` registration with both:

```typescript
/**
 * PATCH /api/practice/:practice_id
 * Set practice as active (canonical REST endpoint)
 */
practiceApp.openapi(routes.setActivePracticeRoute, handlers.setActivePracticeHandler);

/**
 * PUT /api/practice/:practice_id/active
 * @deprecated — use PATCH /api/practice/:practice_id with { is_active: true }
 */
practiceApp.openapi(routes.setActivePracticeDeprecatedRoute, handlers.setActivePracticeHandler);
```

- [ ] **Step 3: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors. If TypeScript complains about the `PATCH` handler not matching the route type, check that `setActivePracticeHandler` is typed as `AppRouteHandler<typeof routes.setActivePracticeRoute>` (the new PATCH route, not the old PUT).

---

## Self-Review Checklist

- [x] Task 1a: client routes `deleteClientRoute` + `deleteClientMemoRoute` schemas fixed
- [x] Task 1b: invoice delete route + handler updated
- [x] Task 1c: matter core delete route + handler updated
- [x] Task 1d: all 4 matter sub-resource delete routes + handlers updated
- [x] Task 2a: matters list route + handler standardized
- [x] Task 2b: invoices list route + handler standardized (with note about query field names)
- [x] Task 2c: client invoices list route + handler standardized (with conditional step for service return shape)
- [x] Task 3a: `GET /` added alongside deprecated `GET /list` — same handler, zero logic duplication
- [x] Task 3b: `PATCH /{practice_id}` added alongside deprecated `PUT /{practice_id}/active` — same handler
- [x] Breaking change flagged at top of plan
- [x] Deprecated routes use `deprecated: true` OpenAPI flag — shows as strikethrough in docs
- [x] `deleteMatterNoteHandler` correctly uses direct `await` (no Result pattern) — verified from handler code
- [x] No placeholders — all steps show exact code or describe exact conditional based on service inspection
- [x] `OffsetPaginatedResponse<T>` type in `shared/types/pagination.ts` matches `{ data, pagination: { page, limit, total } }` exactly
