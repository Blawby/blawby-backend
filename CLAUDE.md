# Blawby Backend - AI Agent Instructions

> This file is the single source of truth for all AI coding agents (Claude, Cursor, Gemini, Copilot).
> Read `.agents/` for detailed standards, workflows, and patterns.

## Project Overview

**Blawby** is a legal practice management SaaS backend. It manages matters (cases), clients, billing, invoices, subscriptions, and practice administration for law firms.

- **Runtime**: Node.js (>=18.17.0) with TypeScript 5.9
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
3. **NEVER use `z` from `zod` directly** — Import from `@hono/zod-openapi`
4. **NEVER use `z.string().uuid()`** — Use `z.uuid()` (Zod v4)
5. **NEVER throw for expected failures** — Use the `Result<T>` pattern from `@/shared/utils/result`
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
    <module>/
      index.ts                     # Entry point — exports http app
      http.ts                      # Route registration (app.openapi)
      handlers.ts                  # Request handlers (thin, delegates to services)
      routes/                      # OpenAPI route definitions (routeBuilder.build)
        index.ts                   # Re-exports all routes as single `routes` object
        core.routes.ts             # Main CRUD routes
        <sub>.routes.ts            # Sub-resource routes
      services/                    # Business logic (Result<T> pattern)
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
    types/                         # Result<T>, AppContext, ServiceContext, etc.
    utils/                         # Response utils, result helpers, env
    validations/                   # OpenAPI error schemas, common validators
```

## Architecture Patterns

### Module Registration
Modules are auto-discovered at build time via generated registries:
- `src/shared/router/modules.generated.ts` — Module HTTP exports
- `src/shared/router/configs.generated.ts` — Module middleware configs
- Mounted at `/api/<module-name>` automatically by `registerModuleRoutes()`

### Handler → Service → Repository Flow
```
Handler (thin)  →  Service (business logic, Result<T>)  →  Repository (Drizzle queries)
     ↓                        ↓                                    ↓
  c.req.valid()     ServiceContext (userId, orgId, ability, emit)   db / tx
  response.fromResult()   result.ok() / result.notFound()         .returning()
```

### ServiceContext
Every handler extracts context via `getServiceContext(c)`:
```typescript
const ctx = getServiceContext(c);
// ctx.userId, ctx.organizationId, ctx.ability, ctx.memberRole, ctx.emit()
```

### Event System
Laravel-inspired: define event classes extending `BaseEvent<T>`, dispatch via `ctx.emit()` in services, listen via `Event.listen()` in `listeners.ts` files.

## Before Completing Any Task

1. Run `pnpm run typecheck` to verify types
2. Run `pnpm run format:check` to verify formatting
3. If you created a new schema, run `pnpm run db:generate`
4. Check for dead imports and unused code
