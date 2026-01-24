---
description: Code Quality Standards (Gold Standard) for Blawby Backend
---

# Gold Standard Coding Standards

Follow these established patterns for all module implementations in the Blawby backend.

## 1. Repository & Service Pattern
Methods must be defined as separate arrow function constants and then exported via a single object at the bottom of the file. No `async function` or object-method shorthand.

```typescript
// ✅ CORRECT
const create = async (data: any) => { ... };
const findById = async (id: string) => { ... };

export const myRepository = {
  create,
  findById,
};

// ❌ INCORRECT
export const myRepository = {
  async create(data: any) { ... },
  findById: async function(id: string) { ... }
};
```

## 2. Database Schema Pattern
Group exports (tables, relations) into a single `{moduleName}Schema` object. Import module-internal schemas using the same object-destructuring pattern.

```typescript
// ✅ CORRECT (in schema file)
export const practiceClientsSchema = {
  practiceClients,
  practiceClientsRelations,
};

// ✅ CORRECT (in query file)
import { practiceClientsSchema } from '@/modules/clients/database/schema/practice-clients.schema';
const { practiceClients } = practiceClientsSchema;
```

## 3. Validation Pattern (Hono Zod OpenAPI)
Always use `z` from `@hono/zod-openapi` instead of plain `zod`. 

- Use `z.iso.datetime()` for all date and timestamp fields.
- Append `.openapi('SchemaName')` to all exported schemas for generated documentation.
- Use `z.coerce` for query parameter numeric conversion.

```typescript
import { z } from '@hono/zod-openapi';

export const mySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.iso.datetime(),
}).openapi('MySchema');
```

## 4. Import & Path Pattern (Aliases)
Strictly use alias paths for all internal and external imports. Never use relative paths (`./` or `../`).

- `@/modules/module-name/...` for module internal/external cross-references.
- `@/shared/...` for shared utilities and types.
- `@/schema` for the central database schema index.

## 5. Module Entry Point
Every module `index.ts` should be minimal and simply export the Hono application instance (or `http.ts` content).

```typescript
import http from '@/modules/my-module/http';
export default http;
```
