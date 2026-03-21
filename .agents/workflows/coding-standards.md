---
description: Code Quality Standards (Gold Standard) for Blawby Backend
globs: ["src/**/*.ts"]
---

# Gold Standard Coding Standards

Follow these established patterns for all module implementations in the Blawby backend.
**Use sequential thinking before implementing any pattern below** — verify it matches the actual codebase first.

## 1. Repository & Service Pattern

Functions are defined as separate `const` arrow expressions, then exported via a single object.

```typescript
// ✅ CORRECT — from src/modules/matters/services/matters.service.ts
const createMatter = async (
  data: CreateMatterRequest,
  ctx: ServiceContext,
): Promise<Result<MatterRecord>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Matter');
  // ... business logic
  return result.ok(matter);
};

const listMatters = async (
  filters: ListMattersQuery,
  ctx: ServiceContext,
): Promise<PaginatedResult<MatterRecord, 'matters'>> => {
  // ...
};

export const mattersService = {
  createMatter,
  listMatters,
};

// ❌ INCORRECT — object method shorthand or async function declarations
export const mattersService = {
  async createMatter(data: any) { ... },  // WRONG
};
```

## 2. Handler Pattern

Handlers are thin — extract validated data, call service, return response. Every handler gets `ServiceContext`.

```typescript
// ✅ CORRECT — from src/modules/matters/handlers.ts
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { response } from '@/shared/utils/responseUtils';

const createMatterHandler: AppRouteHandler<typeof matterRoutes.createMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const validatedBody = c.req.valid('json');
  const result = await mattersService.createMatter(validatedBody, ctx);
  return response.fromResult(c, result);
};

// For creation (201):
return response.fromResult(c, result, 201);

// Export as single object:
export const handlers = {
  createMatterHandler,
  getMattersHandler,
  // ...
};
```

## 3. Route Definition Pattern

Use `routeBuilder.build()` with OpenAPI schemas. Standard error responses are auto-included.

```typescript
// ✅ CORRECT — from src/modules/matters/routes/core.routes.ts
import { z } from '@hono/zod-openapi';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const createMatterRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/matters',
  tags,
  summary: 'Create a new matter',
  request: {
    params: z.object({
      practice_id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: createMatterRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Matter created successfully',
      content: {
        'application/json': {
          schema: z.object({
            matter: matterResponseSchema,
          }),
        },
      },
    },
  },
});
```

### Route Path Conventions

| Action     | Method   | Path Pattern                              |
|------------|----------|-------------------------------------------|
| **List**   | `GET`    | `/{practice_id}/<resource>`               |
| **Create** | `POST`   | `/{practice_id}/<resource>`               |
| **Get**    | `GET`    | `/{practice_id}/<resource>/{id}`          |
| **Update** | `PUT`    | `/{practice_id}/<resource>/{id}`          |
| **Delete** | `DELETE` | `/{practice_id}/<resource>/{id}`          |

Sub-resources nest under the parent: `/{practice_id}/matters/{id}/notes/{note_id}`

### Route Index File

All routes are re-exported from `routes/index.ts` as a single `routes` object:
```typescript
// src/modules/<module>/routes/index.ts
export const routes = {
  createMatterRoute,
  getMattersRoute,
  // ...all route exports
};
```

## 4. HTTP App Pattern (http.ts)

```typescript
// ✅ CORRECT — from src/modules/matters/http.ts
import { handlers } from '@/modules/matters/handlers';
import { routes } from '@/modules/matters/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';

const app = createHonoApp();

// Module-level middleware (if needed)
app.use('*', injectAbility());

// Register routes
app.openapi(routes.createMatterRoute, handlers.createMatterHandler);
app.openapi(routes.getMattersRoute, handlers.getMattersHandler);
// ...

export default app;
```

## 5. Module Entry Point (index.ts)

Minimal — just export the HTTP app:
```typescript
// ✅ CORRECT — from src/modules/matters/index.ts
import mattersApp from '@/modules/matters/http';
export default mattersApp;

// Optionally re-export types/schemas for cross-module use
export * from '@/modules/matters/types/matter.types';
export * from '@/modules/matters/database/schema/matters.schema';
```

## 6. Database Schema Pattern (Drizzle)

```typescript
// ✅ CORRECT — from src/modules/matters/database/schema/matters.schema.ts
import { relations } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';

export const matters = pgTable(
  'matters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id').notNull().references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    status: varchar('status', { length: 40 }).notNull().default('first_contact'),
    deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('matters_org_idx').on(table.organization_id),
    index('matters_status_idx').on(table.status),
  ],
);

export const mattersRelations = relations(matters, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [matters.organization_id],
    references: [organizations.id],
  }),
}));

// Type exports
export type InsertMatter = typeof matters.$inferInsert;
export type SelectMatter = typeof matters.$inferSelect;
```

## 7. Result Pattern

```typescript
import { result } from '@/shared/utils/result';
import type { Result, PaginatedResult } from '@/shared/types/result';

// Success
return result.ok(data);

// Failures (never throw for expected domain errors)
return result.notFound('Matter not found');
return result.badRequest('Invalid client_id');
return result.forbidden('Access denied');
return result.conflict('Already exists');
return result.internalError('Unexpected failure');

// Accepted (async operations)
return result.accepted('Processing started');
```

## 8. Validation Pattern (Zod + OpenAPI)

```typescript
// ✅ CORRECT
import { z } from '@hono/zod-openapi';  // NEVER from 'zod'

export const createMatterRequestSchema = z.object({
  title: z.string().min(1).max(255),
  billing_type: z.enum(['hourly', 'fixed', 'contingency', 'pro_bono']),
  open_date: z.iso.datetime().optional(),
  client_id: z.uuid().optional(),       // z.uuid(), NOT z.string().uuid()
}).openapi('CreateMatterRequest');

// Infer types from schemas
export type CreateMatterRequest = z.infer<typeof createMatterRequestSchema>;
```

## 9. Import & Path Pattern

```typescript
// ✅ CORRECT — always alias paths
import { mattersService } from '@/modules/matters/services/matters.service';
import { result } from '@/shared/utils/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { db } from '@/shared/database';
import { matters } from '@/modules/matters/database/schema/matters.schema';

// ❌ INCORRECT — relative paths
import { mattersService } from '../services/matters.service';  // NEVER
import { result } from '../../shared/utils/result';            // NEVER
```

## 10. Early Returns (Guard Clauses)

```typescript
// ✅ CORRECT
const processRequest = async (data: Input, ctx: ServiceContext): Promise<Result<Output>> => {
  if (!data.id) {
    return result.badRequest('Missing ID');
  }

  const existing = await repository.findById(data.id);
  if (!existing || existing.organization_id !== ctx.organizationId) {
    return result.notFound('Resource not found');
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', toSubject('Resource', existing));

  // ... proceed with business logic
  return result.ok(updated);
};
```

## 11. Event Listener Pattern

```typescript
// ✅ CORRECT — from src/modules/preferences/listeners.ts
import { getLogger } from '@logtape/logtape';
import { Event } from '@/shared/events/event';
import { AuthUserSignedUp } from '@/shared/events/definitions';

const logger = getLogger(['preferences', 'listeners']);

const registerPreferencesListeners = (): void => {
  Event.listen(AuthUserSignedUp, async (payload) => {
    const userId = payload.user_id;
    if (!userId) {
      logger.warn('Event missing user_id');
      return;
    }
    // ... handle event
  });
};

export { registerPreferencesListeners };
```

## 12. Formatting Rules (ESLint)

- **Indent**: 2 spaces
- **Semicolons**: Always
- **Quotes**: Single quotes
- **Trailing commas**: Always in multiline
- **Max line length**: 120 characters
- **Import order**: builtin → external → internal → parent → sibling → index (alphabetized)
- **Brace style**: 1tbs (one true brace style)
- **Arrow parens**: Always required

Run `pnpm run format` to auto-fix. Run `pnpm run format:check` to verify.
