# API Non-Breaking Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two mechanical issues in the practice and matters route definitions that don't change the API contract for consumers.

**Architecture:** All changes are confined to route schema definitions and handler param destructuring. No service layer, no DB, no migrations. Zero risk of breaking existing clients.

**Tech Stack:** Hono + `@hono/zod-openapi`, TypeScript 5.9, pnpm

---

## File Map

| File | Change |
|------|--------|
| `src/modules/practice/routes/practice.routes.ts` | Rename param key `uuid` → `id`, path `/{uuid}` → `/{id}` |
| `src/modules/practice/routes/practice-details.routes.ts` | Same rename |
| `src/modules/practice/handlers.ts` | `const { uuid }` → `const { id }` in 6 handlers |
| `src/modules/matters/routes/time-entries.routes.ts` | Add unit descriptions to stats schema, fix summary typo |

---

## Task 1: Rename `uuid` → `id` in practice routes

**Files:**
- Modify: `src/modules/practice/routes/practice.routes.ts`
- Modify: `src/modules/practice/routes/practice-details.routes.ts`
- Modify: `src/modules/practice/handlers.ts`

**Context:** The practice module uses `{uuid}` as the path param name (e.g. `path: '/{uuid}'`). Every other module uses `{practice_id}`. CLAUDE.md rule 9 states "Use `practice_id` in API paths" — this makes it unambiguous to frontend developers what value to pass. `{uuid}` describes the *type*, not the semantic meaning. `{practice_id}` is explicit and consistent with every other module.

This does NOT change URL structure for consumers — `/api/practice/123e...` stays the same. It only fixes the internal param name used in the OpenAPI schema and TypeScript destructuring.

- [ ] **Step 1: Update `practice.routes.ts`**

Replace the entire `practiceUuidParamOpenAPISchema` definition and all occurrences of `/{uuid}` in the file:

```typescript
// BEFORE (in practice.routes.ts):
const practiceUuidParamOpenAPISchema = z.object({
  uuid: z.uuid().openapi({
    param: {
      name: 'uuid',
      in: 'path',
    },
    description: 'Practice/Organization ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

// AFTER:
const practiceIdParamSchema = z.object({
  practice_id: z.uuid().openapi({
    param: {
      name: 'practice_id',
      in: 'path',
    },
    description: 'Practice ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});
```

Then in each route that uses `practiceUuidParamOpenAPISchema`, change to `practiceIdParamSchema`. Also change all `path: '/{uuid}'` → `path: '/{practice_id}'` and `path: '/{uuid}/active'` → `path: '/{practice_id}/active'`.

Full updated `practice.routes.ts`:

```typescript
import { z } from '@hono/zod-openapi';
import { practiceValidations } from '@/modules/practice/validations/practice.validation';
import { routeBuilder } from '@/shared/router/route-builder';

const practiceIdParamSchema = z.object({
  practice_id: z.uuid().openapi({
    param: {
      name: 'practice_id',
      in: 'path',
    },
    description: 'Practice ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

export const listPracticesRoute = routeBuilder.build({
  method: 'get',
  path: '/list',
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

export const createPracticeRoute = routeBuilder.build({
  method: 'post',
  path: '/',
  tags: ['Practice'],
  summary: 'Create practice',
  description: 'Create a new practice (organization with optional practice details)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: practiceValidations.createPracticeSchema,
        },
      },
      description: 'Practice creation data',
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceSingleResponseSchema,
        },
      },
      description: 'Practice created successfully',
    },
  },
});

export const getPracticeByIdRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Practice'],
  summary: 'Get practice by ID',
  description: 'Retrieve a specific practice by its UUID',
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceSingleResponseSchema,
        },
      },
      description: 'Practice retrieved successfully',
    },
  },
});

export const updatePracticeRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}',
  tags: ['Practice'],
  summary: 'Update practice',
  description: 'Update an existing practice',
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: practiceValidations.updatePracticeSchema,
        },
      },
      description: 'Practice update data',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceSingleResponseSchema,
        },
      },
      description: 'Practice updated successfully',
    },
  },
});

export const deletePracticeRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}',
  tags: ['Practice'],
  summary: 'Delete practice',
  description: 'Delete a practice by its UUID',
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    204: {
      description: 'Practice deleted successfully',
    },
  },
});

export const setActivePracticeRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/active',
  tags: ['Practice'],
  summary: 'Set active practice',
  description: 'Set a practice as the active practice for the authenticated user',
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

- [ ] **Step 2: Update `practice-details.routes.ts`**

Same rename: `practiceUuidParamOpenAPISchema` → `practiceIdParamSchema`, key `uuid` → `practice_id`, `/{uuid}` → `/{practice_id}`:

```typescript
import { z } from '@hono/zod-openapi';
import { practiceValidations } from '@/modules/practice/validations/practice.validation';
import { routeBuilder } from '@/shared/router/route-builder';

const practiceIdParamSchema = z.object({
  practice_id: z.uuid().openapi({
    param: {
      name: 'practice_id',
      in: 'path',
    },
    description: 'Practice ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

export const getPracticeDetailsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/details',
  tags: ['Practice'],
  summary: 'Get practice details',
  description: 'Retrieve practice details for a specific practice',
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceDetailsSingleResponseSchema,
        },
      },
      description: 'Practice details retrieved successfully',
    },
  },
});

export const createPracticeDetailsRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/details',
  tags: ['Practice'],
  summary: 'Create practice details',
  description: 'Create practice details for a practice',
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: practiceValidations.createPracticeDetailsSchema,
        },
      },
      description: 'Practice details data',
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceDetailsCreateResponseSchema,
        },
      },
      description: 'Practice details created successfully',
    },
  },
});

export const updatePracticeDetailsRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/details',
  tags: ['Practice'],
  summary: 'Update practice details',
  description: "Update practice details for a practice (creates if doesn't exist)",
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: practiceValidations.updatePracticeDetailsSchema,
        },
      },
      description: 'Practice details update data',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceDetailsUpdateResponseSchema,
        },
      },
      description: 'Practice details updated successfully',
    },
  },
});

export const deletePracticeDetailsRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/details',
  tags: ['Practice'],
  summary: 'Delete practice details',
  description: 'Delete practice details for a practice',
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    204: {
      description: 'Practice details deleted successfully',
    },
  },
});

export const getPracticeDetailsBySlugRoute = routeBuilder.build({
  method: 'get',
  path: '/details/{slug}',
  tags: ['Practice'],
  summary: 'Get practice details by slug',
  description: 'Retrieve practice details by slug (Public endpoint)',
  request: {
    params: z.object({
      slug: z.string().openapi({
        param: {
          name: 'slug',
          in: 'path',
        },
        description: 'Practice Slug',
        example: 'my-legal-practice',
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceDetailsSingleResponseSchema,
        },
      },
      description: 'Practice details retrieved successfully',
    },
  },
});
```

- [ ] **Step 3: Update `handlers.ts` — rename `uuid` destructuring to `practice_id`**

Every handler that does `const { uuid } = c.req.valid('param')` must change to `const { practice_id } = c.req.valid('param')`. Then pass `practice_id` where `uuid` was used:

```typescript
export const getPracticeHandler: AppRouteHandler<typeof routes.getPracticeByIdRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const result = await practiceQueriesService.getPracticeById({ organizationId: practice_id }, ctx);
  return c.json(result);
};

export const updatePracticeHandler: AppRouteHandler<typeof routes.updatePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceManagementService.updatePractice(
    {
      organizationId: practice_id,
      data: validatedBody,
    },
    ctx
  );
  return c.json(result);
};

export const deletePracticeHandler: AppRouteHandler<typeof routes.deletePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  await practiceDetailsManagementService.deletePractice({ organizationId: practice_id }, ctx);
  return c.body(null, 204);
};

export const setActivePracticeHandler: AppRouteHandler<typeof routes.setActivePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  await practiceDetailsManagementService.setActivePractice({ organizationId: practice_id }, ctx);
  return c.json({ success: true });
};

export const getPracticeDetailsHandler: AppRouteHandler<typeof routes.getPracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const result = await practiceQueriesService.getPracticeDetails({ organizationId: practice_id }, ctx);
  return c.json(result);
};

export const createPracticeDetailsHandler: AppRouteHandler<typeof routes.createPracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceDetailsManagementService.upsertPracticeDetails(
    {
      organizationId: practice_id,
      data: validatedBody,
    },
    ctx
  );
  return c.json(result, 201);
};

export const updatePracticeDetailsHandler: AppRouteHandler<typeof routes.updatePracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceDetailsManagementService.upsertPracticeDetails(
    {
      organizationId: practice_id,
      data: validatedBody,
    },
    ctx
  );
  return c.json(result);
};

export const deletePracticeDetailsHandler: AppRouteHandler<typeof routes.deletePracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  await practiceDetailsManagementService.deletePracticeDetails({ organizationId: practice_id }, ctx);
  return c.body(null, 204);
};
```

Note: `listPracticesHandler`, `createPracticeHandler`, and `getPracticeDetailsBySlugHandler` don't use the `uuid` param and need no changes.

- [ ] **Step 4: Type-check**

```bash
cd /Users/giteshkhurani/Projects/blawby-ts
pnpm run typecheck
```

Expected: no errors. If TypeScript complains about `uuid` not existing on the param type, you've missed a `const { uuid }` destructure somewhere in handlers.ts.


---

## Task 2: Document time entry stats units

**Files:**
- Modify: `src/modules/matters/routes/time-entries.routes.ts`

**Context:** `getTimeEntryStatsRoute` has a comment `// Minutes? or milliseconds?` on its schema — the unit is not communicated to API consumers. The summary also has a typo: `'Get time entry'` instead of `'Get time entry stats'`.

- [ ] **Step 1: Update the stats route schema**

In `src/modules/matters/routes/time-entries.routes.ts`, replace the `getTimeEntryStatsRoute` definition:

```typescript
export const getTimeEntryStatsRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/time-entries/stats',
  tags,
  summary: 'Get time entry stats',
  request: {
    params: z.object({
      matter_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Time entry stats retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            total_time: z.number().openapi({
              description: 'Total logged time in minutes',
              example: 120,
            }),
            billable_time: z.number().openapi({
              description: 'Total billable time in minutes',
              example: 90,
            }),
          }),
        },
      },
    },
  },
});
```

- [ ] **Step 2: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors.


---

## Task 3: Descriptive resource param names across all modules

**Files:**
- Modify: `src/modules/clients/routes.ts`
- Modify: `src/modules/clients/handlers.ts`
- Modify: `src/modules/matters/routes/core.routes.ts`
- Modify: `src/modules/matters/routes/notes.routes.ts`
- Modify: `src/modules/matters/routes/time-entries.routes.ts`
- Modify: `src/modules/matters/routes/expenses.routes.ts`
- Modify: `src/modules/matters/routes/milestones.routes.ts`
- Modify: `src/modules/matters/routes/activity.routes.ts`
- Modify: `src/modules/matters/routes/tasks.routes.ts`
- Modify: `src/modules/matters/routes/unbilled.routes.ts`
- Modify: `src/modules/matters/handlers.ts`
- Modify: `src/modules/invoices/routes.ts`
- Modify: `src/modules/invoices/handlers.ts`

**Context:** Generic `{id}` tells API consumers nothing. `{client_id}`, `{matter_id}`, `{invoice_id}` make OpenAPI docs self-documenting. This is purely a documentation/schema rename — URL values passed by callers are identical, so this is **non-breaking**.

**Rule:** Never name a path param after its type (`uuid`) or a generic placeholder (`id`). Name it after the resource it identifies.

---

### 3a: Clients — `{id}` → `{client_id}`

- [ ] **Step 1: Update param schemas in `src/modules/clients/routes.ts`**

Find `clientParamsSchema` in `src/modules/clients/validations/clients.validation.ts` (imported as `clientParamsSchema`). If it defines `id: z.uuid()`, change the key to `client_id`. If it's defined inline in routes.ts, change it there.

Then update all path definitions: `/{practice_id}/{id}` → `/{practice_id}/{client_id}` and `/{practice_id}/{id}/memos` → `/{practice_id}/{client_id}/memos`.

Check the `clientParamsSchema` and `memoParamsSchema` definitions — they likely contain the `id` field. Rename `id` → `client_id` in both. The paths automatically follow if the schemas are the source of truth.

- [ ] **Step 2: Update destructuring in `src/modules/clients/handlers.ts`**

Every `const { id } = c.req.valid('param')` → `const { client_id: id } = c.req.valid('param')`.

Using the alias `: id` keeps internal variable names unchanged so you don't have to touch the service calls:

```typescript
export const getClientHandler: AppRouteHandler<typeof getClientRoute> = async (c) => {
  const { client_id: id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  const result = await clientsCrudService.getClient({ id }, ctx);
  return c.json(result);
};

export const updateClientHandler: AppRouteHandler<typeof updateClientRouteType> = async (c) => {
  const { client_id: id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);
  const result = await clientsCrudService.updateClient({ id, data: body }, ctx);
  return c.json(result);
};

export const deleteClientHandler: AppRouteHandler<typeof deleteClientRouteType> = async (c) => {
  const { client_id: id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  await clientsCrudService.deleteClient({ id }, ctx);
  return c.body(null, 204);
};

export const listClientMemosHandler: AppRouteHandler<typeof listClientMemosRoute> = async (c) => {
  const { client_id: clientId } = c.req.valid('param');
  const ctx = getServiceContext(c);
  const result = await clientMemosService.listMemos({ clientId }, ctx);
  return c.json(result);
};

export const createClientMemoHandler: AppRouteHandler<typeof createClientMemoRoute> = async (c) => {
  const { client_id: clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);
  const result = await clientMemosService.createMemo(
    {
      clientId,
      data: {
        ...body,
        event_time: body.event_time ? new Date(body.event_time) : undefined,
      },
    },
    ctx
  );
  return c.json(result, 201);
};

export const updateClientMemoHandler: AppRouteHandler<typeof updateClientMemoRoute> = async (c) => {
  const { client_id: clientId, memo_id: id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);
  const result = await clientMemosService.updateMemo(
    {
      id,
      clientId,
      data: {
        ...body,
        event_time: body.event_time ? new Date(body.event_time) : undefined,
      },
    },
    ctx
  );
  return c.json(result);
};

export const deleteClientMemoHandler: AppRouteHandler<typeof deleteClientMemoRoute> = async (c) => {
  const { client_id: clientId, memo_id: id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  await clientMemosService.deleteMemo({ id, clientId }, ctx);
  return c.body(null, 204);
};
```

- [ ] **Step 3: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors.

---

### 3b: Matters — `{id}` → `{matter_id}` in core and all sub-resources

- [ ] **Step 1: Update core route params in `src/modules/matters/routes/core.routes.ts`**

In `getMatterRoute`, `updateMatterRoute`, `deleteMatterRoute` — the params object has `{ practice_id, id }`. Rename `id` → `matter_id`:

```typescript
params: z.object({
  practice_id: z.uuid(),
  matter_id: z.uuid(),
}),
```

Also update the path: `/{practice_id}/{id}` → `/{practice_id}/{matter_id}`.

- [ ] **Step 2: Update sub-resource route params (5 files)**

In each of the following files, every route that uses `params: z.object({ id: z.uuid() })` must change to `params: z.object({ matter_id: z.uuid() })`. Also update the path prefix `/{id}/` → `/{matter_id}/`:

- `src/modules/matters/routes/notes.routes.ts` — `/{id}/notes` → `/{matter_id}/notes`, `/{id}/notes/{note_id}` → `/{matter_id}/notes/{note_id}`
- `src/modules/matters/routes/time-entries.routes.ts` — `/{id}/time-entries` → `/{matter_id}/time-entries`, `/{id}/time-entries/{entry_id}` → `/{matter_id}/time-entries/{entry_id}`, `/{id}/time-entries/stats` → `/{matter_id}/time-entries/stats`
- `src/modules/matters/routes/expenses.routes.ts` — `/{id}/expenses` → `/{matter_id}/expenses`, `/{id}/expenses/{expense_id}` → `/{matter_id}/expenses/{expense_id}`
- `src/modules/matters/routes/milestones.routes.ts` — `/{id}/milestones` → `/{matter_id}/milestones`, `/{id}/milestones/{milestone_id}` → `/{matter_id}/milestones/{milestone_id}`, `/{id}/milestones/reorder` → `/{matter_id}/milestones/reorder`
- `src/modules/matters/routes/activity.routes.ts`, `tasks.routes.ts`, `unbilled.routes.ts` — same pattern

- [ ] **Step 3: Update destructuring in `src/modules/matters/handlers.ts`**

Use the alias pattern to avoid touching service call arguments. The handlers already alias to `matterId` in most places — just change the source key:

```typescript
// Core matter handlers
const getMatterHandler = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: id } = c.req.valid('param');
  // ...existing service call unchanged...
};

// Sub-resource handlers — all use { id: matterId } alias today
// Change to { matter_id: matterId }:
const listMatterNotesHandler = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');  // was: { id: matterId }
  const scopedCtx = { ...ctx, matterId };
  // ...rest unchanged...
};
```

Apply this alias change to every handler in `matters/handlers.ts` that currently destructures `{ id: matterId }` or `{ id }` from the param.

- [ ] **Step 4: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors.

---

### 3c: Invoices — `{id}` → `{invoice_id}`

- [ ] **Step 1: Update `invoiceParamSchema` in `src/modules/invoices/routes.ts`**

Find:
```typescript
const invoiceParamSchema = practiceIdParamSchema.extend({
  id: z.uuid().openapi({
    param: { name: 'id', in: 'path' },
    description: 'Invoice ID (UUID)',
    example: '789a1234-b56c-78d9-e012-345678901234',
  }),
});
```

Change to:
```typescript
const invoiceParamSchema = practiceIdParamSchema.extend({
  invoice_id: z.uuid().openapi({
    param: { name: 'invoice_id', in: 'path' },
    description: 'Invoice ID (UUID)',
    example: '789a1234-b56c-78d9-e012-345678901234',
  }),
});
```

Then update all paths that use `/{id}` → `/{invoice_id}`:
- `/{practice_id}/{id}` → `/{practice_id}/{invoice_id}` (get, update, delete, send, sync, void)
- `/{practice_id}/client/{id}` → `/{practice_id}/client/{invoice_id}`

- [ ] **Step 2: Update destructuring in `src/modules/invoices/handlers.ts`**

Every `const { id, practice_id: organizationId } = c.req.valid('param')` → `const { invoice_id: id, practice_id: organizationId } = c.req.valid('param')`.

The alias `: id` keeps all service call arguments unchanged:

```typescript
const getInvoiceHandler: AppRouteHandler<typeof routes.getInvoiceRoute> = async (c) => {
  const { invoice_id: id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const result = await invoiceQueriesService.getInvoiceById({ id }, ctx);
  return c.json(result, 200);
};

// Apply the same alias pattern to: updateInvoiceHandler, deleteInvoiceHandler,
// sendInvoiceHandler, syncInvoiceHandler, voidInvoiceHandler, getClientInvoiceDetailHandler
```

- [ ] **Step 3: Type-check**

```bash
pnpm run typecheck
```

Expected: no errors.


---

## Self-Review Checklist

- [x] Task 1 covers: `uuid` → `practice_id` rename in both practice route files + handlers
- [x] Task 2 covers: time stats unit docs + summary typo + `{matter_id}` param
- [x] Task 3 covers: `{id}` → `{client_id}`, `{matter_id}`, `{invoice_id}` across all affected modules
- [x] No TBDs or placeholder steps
- [x] All handler code uses alias pattern (`{ matter_id: matterId }`) to avoid touching service calls
- [x] `getPracticeDetailsBySlugHandler` correctly excluded (uses `slug` not `uuid`)
- [x] `listPracticesHandler` and `createPracticeHandler` correctly excluded (no path param)
- [x] `practiceIdParamSchema` key is `practice_id` consistently in both route files
