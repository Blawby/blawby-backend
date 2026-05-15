# Blawby Backend - AI Agent Instructions

> This file is the single source of truth for all AI coding agents (Claude, Cursor, Gemini, Copilot).
> Read `.agents/` for detailed standards, workflows, and patterns.

## Project Overview

**Blawby** is a legal practice management SaaS backend. It manages matters (cases), clients, billing, invoices, subscriptions, and practice administration for law firms.

- **Runtime**: Node.js (>=18.17.0) with TypeScript 6.0
- **Framework**: [Hono](https://hono.dev) with OpenAPI (`@hono/zod-openapi`)
- **Database**: PostgreSQL via [Drizzle ORM](https://orm.drizzle.team) (0.45.x)
- **Auth**: [Better Auth](https://www.better-auth.com/) with session cookies
- **Authorization**: CASL (`@casl/ability`) for role-based access control
- **Validation**: Zod (v4) via `@hono/zod-openapi` — always import `z` from `@hono/zod-openapi`
- **Logging**: LogTape (`@logtape/logtape`) — NEVER use `console.log`
- **Queue**: Graphile Worker (PostgreSQL-backed job queue)
- **Package Manager**: pnpm 10.x
- **Linting**: oxlint (with tsgolint for type-aware rules), formatting via oxfmt
- **Module system**: ESM (`"type": "module"`)

## Critical Rules (Non-Negotiable)

1. **NEVER use relative imports** — Always use `@/` path aliases (`@/shared/...`, `@/modules/...`, `@/schema`)
2. **NEVER use `console.log`** — Use LogTape: `getLogger(['module', 'context'])`
3. **NEVER use `z` from `zod` directly** — Import from `@hono/zod-openapi` for routes and validations
4. **NEVER use `z.string().uuid()`** — Use `z.uuid()` (Zod v4)
5. **Use throw-based error handling** — Services throw `HTTPException` for expected failures (404, 400, 401, 409, 422) and raw `Error` for 500s. Never return `Result<T>` from services.
6. **NEVER use `any`** — ESLint enforces `@typescript-eslint/no-explicit-any: error`
7. **API interfaces are `snake_case`** — Database columns, request/response fields are all `snake_case`
8. **Internal TypeScript is `camelCase`** — Variable names, function names, local logic
9. **Use `practice_id` in API paths** — Even though DB column is `organization_id`, frontend uses `practice_id`
10. **NEVER import `@/schema` in `*.schema.ts` files** — Import `organizations`/`users` from `@/schema/better-auth-schema` directly. Import other tables from their specific `*.schema.ts` file path, never from a barrel index (`*/database/schema`, `*/schemas`). Barrel imports in schema files create ESM circular dependency cycles.

## Key Commands

```bash
pnpm run dev            # Start dev server (tsx watch)
pnpm run dev:full       # Start API + event worker + email worker
pnpm run typecheck      # TypeScript type checking (tsc --noEmit)
pnpm run format         # ESLint fix
pnpm run format:check   # ESLint check
pnpm run lint           # oxlint
pnpm run db:generate    # Generate Drizzle migrations
pnpm run db:migrate     # Run Drizzle migrations
pnpm run db:studio      # Drizzle Studio (DB GUI)
pnpm run test           # Run tests (tap)
pnpm run build          # Production build (tsx scripts/build.ts)
```

## Project Structure

```
src/
  hono-app.ts                      # Main Hono app — mounts all modules
  hono-server.ts                   # HTTP server entry point
  boot/                            # Application bootstrap
  schema/                          # Central DB schema index (re-exports)
  workers/                         # Background workers (event, email)
  scripts/                         # One-off scripts
  modules/                         # Feature modules (domain-driven)
    auth/                          # Authentication
    clients/                       # Client management (profiles, memos)
    dev/                           # Development utilities
    invoices/                      # Invoice management
    matters/                       # Legal matter management
    onboarding/                    # Stripe Connect onboarding
    practice/                      # Practice/organization management
    practice-client-intakes/       # Client intake forms
    preferences/                   # User preferences
    public/                        # Public routes
    stripe/                        # Stripe integration
    subscriptions/                 # Subscription management
    trust/                         # Trust accounting
    uploads/                       # File uploads
    webhooks/                      # Webhook handlers

    <module>/                      # Per-module structure:
      index.ts                     # Entry point — exports http app
      http.ts                      # Route registration (app.openapi)
      handlers.ts                  # Request handlers (thin, delegates to services)
      routes/                      # OpenAPI route definitions (routeBuilder.build)
        index.ts                   # Re-exports all routes as single `routes` object
        core.routes.ts             # Main CRUD routes
        <sub>.routes.ts            # Sub-resource routes
      services/                    # Business logic (throw-based, max ~200 lines per file)
        <name>.service.ts
      database/
        schema/                    # Drizzle table definitions + relations
          index.ts                 # Re-exports all schemas
          <name>.schema.ts
        queries/                   # Repository functions (Drizzle queries)
          <name>.queries.ts
      types/                       # Zod schemas + inferred types
        <name>.types.ts
      validations/                 # Validation schemas (if separate from types)
      listeners.ts                 # Event listeners (Event.listen pattern)
      config.ts                    # Module middleware config (optional)
  shared/
    auth/                          # CASL abilities, Better Auth setup
    database/                      # DB connection, migrations
    enums/                         # Shared enums (org-roles, http-methods)
    events/                        # Event system (BaseEvent, Event.listen)
    logging/                       # LogTape configuration
    middleware/                    # Auth, validation, error handling, CORS
    queue/                         # Graphile Worker queue config
    repositories/                  # Shared repository helpers
    router/                        # Hono app factory, module router, route builder
    schemas/                       # Shared Zod schemas
    services/                      # Shared services
    types/                         # AppContext, ServiceContext, pagination, etc.
    utils/                         # Response utils, result helpers, env
    validations/                   # OpenAPI error schemas, common validators
```

## Architecture Patterns

### Module Registration

Modules are auto-discovered at build time via generated registries:

- `src/shared/router/modules.generated.ts` — Module HTTP exports
- `src/shared/router/configs.generated.ts` — Module middleware configs
- Mounted at `/api/<module-name>` automatically by `registerModuleRoutes()`

### Handler Pattern (Thin)

Handlers are 3-8 lines with no business logic:

```typescript
// handlers.ts
const createThingHandler: AppRouteHandler<typeof routes.createThingRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');

  const thing = await thingService.createThing({ data: body }, ctx); // throws on error
  return c.json(thing, 201);
};
```

**Rules:**

- Always use `getServiceContext(c)` — never extract `user`, `orgId`, `headers` manually
- Never write `if (!user) return ...` — middleware handles auth checks
- Use Hono `c.json(...)` for all JSON responses
- Pass all service inputs as a single object `{ data, ... }` + `ctx`

### Service Pattern (Business Logic with Throws)

Services return data directly and throw for errors (max ~200 lines per file, ~50 lines per function):

```typescript
// thing.service.ts
const createThing = async (
  { data }: { data: CreateThingRequest },
  ctx: ServiceContext,
): Promise<ThingRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Thing');

  return await db.transaction(async (tx) => {
    const [newRecord] = await tx.insert(things).values({ ... }).returning();
    if (!newRecord) {
      throw new HTTPException(500, { message: 'Failed to create Thing' });
    }
    await ctx.emit(ThingCreated, { ... }, tx);
    return newRecord;
  });
};
```

**Rules:**

- Max 2 parameters: `(params, ctx)` — params is an object, ctx is ServiceContext
- Return data directly — do **not** return `Result<T>` objects
- Throw `HTTPException` for expected failures (404, 400, 401, 409, 422)
- Throw raw `Error` for unexpected failures (500)
- CASL check first via `ForbiddenError.from(ctx.ability).throwUnlessCan(...)`
- Special case: webhook/worker services throw raw `Error` to trigger retry logic

### Error Handling Mapping

Services use throw-based error handling instead of `Result<T>`:

| Situation            | Pattern                                                | Status |
| -------------------- | ------------------------------------------------------ | ------ |
| Not found            | `throw new HTTPException(404, { message })`            | 404    |
| Bad input            | `throw new HTTPException(400, { message })`            | 400    |
| Unauthorized         | `throw new HTTPException(401, { message })`            | 401    |
| Access denied (CASL) | `ForbiddenError.from(ctx.ability).throwUnlessCan(...)` | 403    |
| Conflict             | `throw new HTTPException(409, { message })`            | 409    |
| Unprocessable        | `throw new HTTPException(422, { message })`            | 422    |
| Server error         | `throw new Error(msg)` (caught as 500)                 | 500    |

### Paginated Response Pattern

For list endpoints with offset-based pagination:

```typescript
// handlers.ts
const listThingsHandler: AppRouteHandler<typeof routes.listThingsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const response = await thingService.listThings(query, ctx);
  return c.json(response);
};
```

**Rules:**

- Use `OffsetPaginatedResponse<T>` or `CursorPaginatedResponse<T>` from `@/shared/types/pagination`
- Response must have `data` array at the root (not module-specific names)
- Service returns complete pagination metadata via `pagination` or `page_info`

### ServiceContext

Every handler extracts context via `getServiceContext(c)`:

```typescript
const ctx = getServiceContext(c);
// ctx.userId, ctx.organizationId, ctx.ability, ctx.memberRole, ctx.matterId, ctx.emit()
```

### Event System

Laravel-inspired: define event classes extending `BaseEvent<T>`, dispatch via `ctx.emit()` in services, listen via `Event.listen()` in `listeners.ts` files.

## Before Completing Any Task

1. Run `pnpm run typecheck` to verify types
2. Run `pnpm run format:check` to verify formatting
3. If you created a new schema, run `pnpm run db:generate`
4. Check for dead imports and unused code

## Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
