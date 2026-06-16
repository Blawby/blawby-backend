# Coding Standards

This document gives concrete examples for the rules in [`AGENTS.md`](../AGENTS.md). Use it when creating new files or when modifying existing files.

The goal is not to rewrite entire modules opportunistically. The goal is: when a file is already being changed, move it toward the current standard and avoid reintroducing known project issues.

## Touched-File Rule

When you touch a file, check for nearby instances of these known issues and fix them if the change is small and directly related:

- Relative imports in `src/`; use `@/` aliases.
- Service or handler response wrappers; use throw-based services and direct handler responses.
- Handler business logic, raw `c.req.param(...)`, or untyped handlers; use route-typed handlers and `c.req.valid(...)`.
- Direct value imports of `z` from `zod`; use `@hono/zod-openapi` for application schemas.
- API date schemas using `z.date()`; prefer ISO string schemas for API payloads.
- Legacy list responses with resource-named arrays, top-level `page`/`limit`, or `total_pages`; use `{ data, pagination }` or `{ data, page_info }`.
- Worker/listener code that swallows failures needed for retries.
- Event files that are not registered in shared event definitions.
- Oversized files where the current change clearly belongs in an extracted helper or narrower service.

If cleanup would broaden the task significantly, leave a note in the final response instead of doing a surprise refactor.

## Handler Pattern

Handlers should do wiring only: read validated input, create service context, call a service, serialize, and return JSON.

```typescript
import type { routes } from '@/modules/invoices/routes';
import { serializeInvoice } from '@/modules/invoices/serializers/invoice.serializer';
import { invoiceService } from '@/modules/invoices/services/invoice.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const getInvoiceHandler: AppRouteHandler<typeof routes.getInvoiceRoute> = async (c) => {
  const { invoice_id: id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceService.getInvoiceById({ id }, ctx);

  return c.json(serializeInvoice(result), 200);
};

export const handlers = {
  getInvoiceHandler,
} as const;
```

Avoid:

```typescript
const getInvoiceHandler = async (c) => {
  const id = c.req.param('invoice_id');
  const invoice = await invoiceService.getInvoiceById(id);
  return c.json(invoice);
};
```

## Service Pattern

Services return data directly and throw for errors. Use `HTTPException` for expected HTTP failures, raw `Error` for unexpected failures, and preserve causes when wrapping.

```typescript
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['invoices', 'service']);

const getInvoiceById = async ({ id }: { id: string }, ctx: ServiceContext): Promise<InvoiceWithRelations> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Invoice');

  try {
    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      throw new HTTPException(404, { message: 'Invoice not found' });
    }

    return invoice;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to get invoice {invoiceId}: {error}', {
      invoiceId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to get invoice', { cause: error });
  }
};

export const invoiceService = {
  getInvoiceById,
} as const;
```

Avoid service response wrappers or encoded error objects:

```typescript
const getInvoiceById = async (...): Promise<{ data?: Invoice; error?: string }> => {
  if (!invoice) return { error: 'Invoice not found' };
  return { data: invoice };
};
```

## Unit Of Work Pattern

Use `uow.transaction(...)` for application transaction boundaries. Inside repositories and transaction-aware helpers, use `getActiveTx()` instead of importing `db` directly.

```typescript
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { uow } from '@/shared/database/uow';
import { InvoiceDeleted } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';

const deleteInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<void> => {
  await uow.transaction(async () => {
    await invoicesRepository.softDeleteInvoice(id, ctx.organizationId, ctx.userId);
    await ctx.emit(InvoiceDeleted, {
      invoice_id: id,
      organization_id: ctx.organizationId,
      deleted_by: 'user',
    });
  });
};
```

Repository functions should read/write through the active transaction:

```typescript
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { getActiveTx } from '@/shared/database/uow';
import { eq } from 'drizzle-orm';

const findInvoiceById = async (id: string, organizationId: string) =>
  await getActiveTx().query.invoices.findFirst({
    where: (invoice, { and, eq }) => and(eq(invoice.id, id), eq(invoice.organization_id, organizationId)),
  });

const softDeleteInvoice = async (id: string, organizationId: string, deletedBy: string): Promise<void> => {
  await getActiveTx()
    .update(invoices)
    .set({ deleted_at: new Date(), deleted_by: deletedBy })
    .where(eq(invoices.id, id));
};
```

Avoid direct module-level transactions:

```typescript
import { db } from '@/shared/database';

await db.transaction(async (tx) => {
  await tx.insert(...);
});
```

Direct `db.transaction(...)` belongs in the UoW implementation or exceptional infrastructure code, not ordinary module services.

## Route Pattern

Use `routeBuilder.build(...)`, `practice_id` for organization-scoped routes, and typed request schemas.

```typescript
import { invoiceResponseSchema } from '@/modules/invoices/types/invoices.types';
import { routeBuilder } from '@/shared/router/route-builder';
import { z } from '@hono/zod-openapi';

const tags = ['Invoices'];

export const getInvoiceRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/invoices/{invoice_id}',
  tags,
  summary: 'Get an invoice',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      invoice_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Invoice',
      content: {
        'application/json': {
          schema: invoiceResponseSchema,
        },
      },
    },
  },
});
```

## HTTP Module Pattern

Register routes in `http.ts` with the module's middleware and route/handler objects.

```typescript
import { handlers } from '@/modules/invoices/handlers';
import { routes } from '@/modules/invoices/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';

const app = createHonoApp();
app.use('*', requireAuth(), requireOrgMembership(), injectAbility());

app.openapi(routes.getInvoiceRoute, handlers.getInvoiceHandler);

export default app;
```

## Pagination Pattern

Use the shared pagination types from `@/shared/types/pagination`.

- Offset pagination: `OffsetPaginatedResponse<T>` with `{ data, pagination: { page, limit, total } }`.
- Cursor pagination: `CursorPaginatedResponse<T>` with `{ data, page_info }`.
- Use `PaginatedResponse<T>` only when code genuinely accepts either offset or cursor shape.
- Use `pagination` for offset metadata and `page_info` for cursor metadata. Do not return both.
- The list payload array should always be named `data`, not `invoices`, `intakes`, `uploads`, etc.
- Do not add top-level `total_pages`; clients can calculate it from `pagination.total` and `pagination.limit` when needed.

Offset example:

```typescript
import type { SelectPayout } from '@/modules/payouts/database/schema/payouts.schema';
import { payoutsRepository } from '@/modules/payouts/database/queries/payouts.repository';
import type { ListPayoutsQuery } from '@/modules/payouts/schemas/payouts.validation';
import type { OffsetPaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';

const listPayouts = async (
  { filters }: { filters: ListPayoutsQuery },
  ctx: ServiceContext
): Promise<OffsetPaginatedResponse<SelectPayout>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Payout');

  const { payouts, total } = await payoutsRepository.listByOrganization(ctx.organizationId, filters);

  return {
    data: payouts,
    pagination: { page: filters.page, limit: filters.limit, total },
  };
};
```

Cursor example:

```typescript
import type { CursorPaginatedResponse } from '@/shared/types/pagination';

const listMessages = async (
  conversationId: string,
  query: ListMessagesQuery,
  ctx: ServiceContext
): Promise<CursorPaginatedResponse<IntakeConversationMessageResponse>> => {
  const rows = await messagesQueries.listByConversation(conversationId, query.from_seq, query.limit + 1);
  const hasNextPage = rows.length > query.limit;
  const items = hasNextPage ? rows.slice(0, query.limit) : rows;
  const lastItem = items[items.length - 1];

  return {
    data: items.map(toResponse),
    page_info: {
      has_next_page: hasNextPage,
      has_previous_page: query.from_seq !== undefined && query.from_seq > 0,
      next_cursor: hasNextPage && lastItem ? String(lastItem.seq + 1) : null,
      previous_cursor: null,
    },
  };
};
```

OpenAPI list responses should mirror the same shape:

```typescript
import { paginationSchema } from '@/shared/validations/openapi';

responses: {
  200: {
    description: 'Payouts',
    content: {
      'application/json': {
        schema: z.object({
          data: z.array(payoutResponseSchema),
          pagination: paginationSchema,
        }),
      },
    },
  },
}
```

Avoid legacy shapes:

```typescript
return {
  intakes,
  page,
  limit,
  total_pages,
};
```

## Schema Import Pattern

Schema files are allowed to import concrete tables directly. Do not import table dependencies from broad barrels inside `*.schema.ts` files.

```typescript
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { organizations, users } from '@/schema/better-auth-schema';
import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    matter_id: uuid('matter_id').references(() => matters.id, { onDelete: 'set null' }),
    deleted_by: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
  },
  (table) => [index('invoices_org_idx').on(table.organization_id)]
);

export type InsertInvoice = typeof invoices.$inferInsert;
export type SelectInvoice = typeof invoices.$inferSelect;
```

## Event Listener And Job Pattern

Listeners should usually translate events into focused work or enqueue jobs. Let Graphile Worker retry the actual external side effect.

```typescript
import { METERED_TYPES } from '@/modules/subscriptions/constants/metered-products';
import { InvoicePaid } from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';
import { addMeteredUsageJob } from '@/shared/queue/queue.manager';
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['invoices', 'listeners']);

export const registerInvoicesListeners = (): void => {
  Event.listen(InvoicePaid, async (payload) => {
    logger.info('InvoicePaid listener: enqueueing metered usage for invoice {invoiceId}', {
      invoiceId: payload.invoice_id,
    });

    await addMeteredUsageJob({
      organizationId: payload.organization_id,
      meteredType: METERED_TYPES.INVOICE_FEE,
      quantity: 1,
      deduplicationId: payload.invoice_id,
    });
  });
};
```

Avoid direct external calls plus custom retry orchestration inside listeners when a dedicated job can own retries.

## Worker Pattern

Workers validate payloads, perform the side effect, and throw on failure so Graphile can retry.

```typescript
import { METERED_TYPE_TO_STRIPE_EVENT } from '@/modules/subscriptions/constants/metered-products';
import { meteredProductsService } from '@/modules/subscriptions/services/metered-products.service';
import { getLogger } from '@logtape/logtape';
import type { Task } from 'graphile-worker';

const logger = getLogger(['workers', 'process-metered-usage']);

const isKnownMeteredType = (value: string): value is keyof typeof METERED_TYPE_TO_STRIPE_EVENT =>
  Object.hasOwn(METERED_TYPE_TO_STRIPE_EVENT, value);

export const processMeteredUsage: Task = async (payload): Promise<void> => {
  const { organizationId, meteredType, quantity, deduplicationId } =
    (payload as {
      organizationId?: string;
      meteredType?: string;
      quantity?: number;
      deduplicationId?: string;
    }) || {};

  if (
    !organizationId ||
    typeof meteredType !== 'string' ||
    !isKnownMeteredType(meteredType) ||
    typeof quantity !== 'number' ||
    !deduplicationId
  ) {
    logger.error('Invalid metered usage retry payload', { payload });
    throw new Error('Invalid metered usage retry payload');
  }

  await meteredProductsService.reportMeteredUsage({ organizationId, meteredType, quantity, deduplicationId });
};
```

## API Date Schemas

API schemas should describe JSON, not internal `Date` objects.

```typescript
import { z } from '@hono/zod-openapi';

export const invoiceResponseSchema = z.object({
  id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  paid_at: z.iso.datetime({ offset: true }).nullable(),
});
```

Use `Date` types for Drizzle/internal service records as needed, but serialize API responses to ISO strings.

## Logging Pattern

```typescript
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['invoices', 'service']);

logger.info('Invoice {invoiceId} synced for organization {organizationId}', {
  invoiceId,
  organizationId,
});
```

Do not add `console.log`, `console.error`, or unstructured string interpolation in logs.

## Known Cleanup Areas From Audits

These are recurring project issues. Apply the standard when creating new code, and fix touched code when the change is local and low-risk.

| Area | Standard |
| --- | --- |
| Error handling | New service code returns data or throws; no service response wrappers. |
| Handler exports | Prefer `export const handlers = { ... } as const`. |
| Handler input | Prefer `AppRouteHandler<typeof route>` and `c.req.valid(...)`. |
| File naming | Prefer kebab-case service files and `*.queries.ts` for query modules when creating new files. |
| Validation directories | Prefer `validations/` for validation-only schemas; keep `types/` for exported domain/API types. |
| Events | Shared event classes belong under `src/shared/events/definitions/` and must be registered/exported. |
| Listeners | If a module emits events, verify whether listeners are required or intentionally absent. |
| Services | Split oversized files only along real responsibility boundaries. Avoid shallow one-function wrappers. |
| Cross-module access | Prefer a small orchestrator or validation helper over scattering the same cross-module query chain. |
| Imports | Use `@/` aliases and concrete schema imports in schema files. |

Historical audit docs remain useful context, but this file and `AGENTS.md` are the current coding standard.
