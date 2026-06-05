---
title: "feat: MCP route annotation + codegen tool registry"
status: active
created: 2026-05-25
origin: docs/brainstorms/2026-05-25-mcp-tool-registry-abstraction-requirements.md
---

# feat: MCP route annotation + codegen tool registry

## Problem

Adding an MCP tool for a route currently requires:
1. Manually writing a `defineTool()` call in a per-module `mcp.tools.ts`
2. Editing `src/modules/mcp/mcp.tools.ts` to import it
3. Keeping schema in sync with the OpenAPI route definition

(see origin: `docs/brainstorms/2026-05-25-mcp-tool-registry-abstraction-requirements.md`)

---

## Goal

Mark a route with `mcp: { scope, handler }` and run codegen — no other files touched. The tool is live.

---

## Key Technical Decisions

**Handler placement:** `handler` lives inline on the route annotation (not a separate `mcp.tools.ts`). This keeps the route as the single source of truth for the endpoint's MCP exposure.

**Schema derivation:** `routeBuilder.build()` strips `mcp` before calling `createRoute()` and attaches it to the returned object. The `buildMcpToolsFromModule()` utility extracts the request body Zod schema from the route object at runtime via `route.request?.body?.content?.['application/json']?.schema?.shape`. Routes without a request body (e.g., list/get) use `{}` as schema.

**Codegen detection:** Text-scan route files (not dynamic import) for literal `mcp:` to detect which modules have annotated routes. No DB or service code is imported at codegen time.

**Route export normalization:** Modules expose routes as either `export const routes = {}` (matters, invoices) or top-level named exports (clients). The generated file uses `import * as mod` and flattens via `Object.values(mod.routes ?? mod)` — works for both patterns.

**Generated file:** `src/modules/mcp/mcp.tools.generated.ts` — committed to git, same pattern as `modules.generated.ts`. `server.ts` imports `MCP_TOOLS_REGISTRY` from it. The placeholder `src/modules/mcp/mcp.tools.ts` is deleted.

**Tool name convention** (see origin):
- `GET /` or `GET /{practice_id}` → `list_<module>`
- `POST /` or `POST /{practice_id}` → `create_<module>`
- `GET /:id` or `GET /{practice_id}/{*_id}` → `get_<module>`
- `PATCH /:id` or `PUT /:id` → `update_<module>`
- `DELETE /:id` → `delete_<module>`
- Nested routes (`/:id/tasks`) — deferred, name them explicitly via `mcp.name`

---

## Scope Boundaries

**In scope:**
- `routeBuilder.build()` `mcp` annotation extension
- `buildMcpToolsFromModule()` runtime utility in `tool-registry.ts`
- `generateMcpToolsRegistry()` codegen function in `scripts/codegen.ts`
- `mcp.tools.generated.ts` — initial generated file committed
- `server.ts` updated to import from generated file
- `mcp.tools.ts` placeholder deleted
- Annotating `matters`, `clients`, `invoices` routes with `mcp` + handlers

**Out of scope (deferred):**
- Nested route tool naming (e.g., `/:id/tasks`) — naming convention unresolved (see origin)
- Multi-scope gating
- Streaming tools
- Routes on other modules

---

## Implementation Units

### U1. Extend `routeBuilder.build()` with `mcp` annotation

**Goal:** Route definitions can carry `mcp: { scope, description?, handler, name? }`. The annotation is stripped before `createRoute()` and re-attached to the returned object so downstream code can access it without affecting the OpenAPI spec.

**Dependencies:** none

**Files:**
- `src/shared/router/route-builder.ts` (modify)
- `src/shared/types/mcp-route-annotation.ts` (create — or inline in route-builder.ts)

**Approach:**
Define `McpRouteAnnotation`:
```
{
  scope: string
  name?: string        // override derived tool name
  description?: string // override route summary
  handler: (args: Record<string, unknown>, ctx: ServiceContext) => Promise<unknown>
}
```

In `routeBuilder.build()`: destructure `mcp` from config before spreading into `createRoute()`. Attach it to the returned route object with `Object.assign`. Return type intersection includes `{ mcp: McpRouteAnnotation }` when `mcp` is provided, otherwise unchanged.

The `mcp` field must NOT reach `createRoute()` — `@hono/zod-openapi` will reject unknown fields at the type level.

**Patterns to follow:** `src/shared/router/route-builder.ts` — existing generic parameter pattern

**Test scenarios:**
- Route built with `mcp` annotation: returned object has `.mcp.scope`, `.mcp.handler`, no `mcp` field visible to OpenAPI spec
- Route built without `mcp`: returned object has no `.mcp` property, OpenAPI spec unchanged
- TypeScript: `build({ mcp: { scope: 'x', handler: async () => {} }, method: 'get', ... })` typechecks without `any` cast

**Verification:** `pnpm run typecheck` passes; a test route with `mcp` compiles and the returned object's `.mcp` is accessible with correct types.

---

### U2. Add `buildMcpToolsFromModule()` to `tool-registry.ts`

**Goal:** Given a route module's exports (as `Record<string, unknown>`), return an `AnyToolDef[]` for every route with an `.mcp` annotation.

**Dependencies:** U1

**Files:**
- `src/modules/mcp/tool-registry.ts` (modify)

**Approach:**

```
buildMcpToolsFromModule(routeExports: Record<string, unknown>): AnyToolDef[]
```

1. Flatten exports: `const allRoutes = Object.values(routeExports.routes ?? routeExports)`
2. Filter: entries that are objects with a `.mcp` property
3. For each annotated route, derive:
   - `name`: `route.mcp.name ?? deriveToolName(route.method, route.path)`
   - `description`: `route.mcp.description ?? route.summary ?? name`
   - `scope`: `route.mcp.scope`
   - `schema`: `(route.request?.body?.content?.['application/json']?.schema)?.shape ?? {}`
   - `handler`: `route.mcp.handler`
4. Return array of `AnyToolDef` objects (not using `defineTool()` wrapper — direct cast, since types are already correct)

`deriveToolName(method, path)`:
- Normalize path: strip `/{practice_id}` prefix if present (it's just org scoping, not part of the resource name)
- Derive module name from remaining path segments
- Apply convention: `GET /` → `list_<mod>`, `POST /` → `create_<mod>`, `GET /{id}` → `get_<mod>`, `PATCH|PUT /{id}` → `update_<mod>`, `DELETE /{id}` → `delete_<mod>`
- If pattern doesn't match (nested path): fall back to `${method.toLowerCase()}_${path.replace(/[^\w]/g, '_')}`

**Patterns to follow:** `registerTools()` in same file for AnyToolDef shape

**Test scenarios:**
- Route with `mcp: { scope: 'matters:read', handler }` and `method: 'get'`, `path: '/{practice_id}'` → tool name `list_matters`, scope `matters:read`
- Route with request body schema → `schema` equals `.shape` of that schema
- Route without request body (GET) → `schema` is `{}`
- Route with `mcp.name` override → uses the override, not derived name
- Non-annotated route → excluded from output
- Module with `export const routes = {}` pattern → tools derived correctly
- Module with flat named exports pattern → tools derived correctly

**Verification:** Unit tests pass; calling `buildMcpToolsFromModule` with a mock route module returns correct `AnyToolDef[]`.

---

### U3. Add `generateMcpToolsRegistry()` to codegen

**Goal:** Codegen discovers all non-excluded modules that have `mcp:`-annotated routes and emits `src/modules/mcp/mcp.tools.generated.ts`.

**Dependencies:** none (runs independently; U1/U2 must be committed before generated file typechecks)

**Files:**
- `scripts/codegen.ts` (modify)
- `src/modules/mcp/mcp.tools.generated.ts` (created by codegen; commit initial generated file after first run)

**Approach:**

Add constant:
```
const MCP_TOOLS_OUTPUT = join(process.cwd(), 'src/modules/mcp/mcp.tools.generated.ts')
```

`generateMcpToolsRegistry(modules: string[])`:
1. For each module, determine its routes file:
   - Check `routes/index.ts` first (matters pattern)
   - Fall back to `routes.ts` (clients, invoices pattern)
   - Skip module if neither exists
2. Read file as text with `readFile`
3. If text contains `mcp:` → module has annotated routes → include
4. Emit import: `import * as ${camelCase}Routes from '@/modules/${mod}/${routesPath}';`
5. Emit export:
   ```
   export const MCP_TOOLS_REGISTRY: AnyToolDef[] = [
     ...buildMcpToolsFromModule(mattersRoutes),
     ...buildMcpToolsFromModule(clientsRoutes),
     ...
   ];
   ```
6. Add to `Promise.allSettled([...])` in `main()`

Generated file header: `// 🤖 AUTO-GENERATED - DO NOT EDIT\n// Generated by: scripts/codegen.ts`

**Routes path detection:** `routes/index.ts` takes priority over `routes.ts` (matters-style modules have a directory). Store the relative import path (no `.ts` extension) for the import statement.

**Patterns to follow:** `generateConfigRegistry()` in same file — `existsSync` check, file-as-text read pattern

**Test scenarios:**
- Module with `mcp:` in routes file → appears in generated imports and registry spread
- Module without `mcp:` in routes file → excluded
- Module with neither `routes/index.ts` nor `routes.ts` → skipped silently
- Running codegen twice produces identical output (idempotent)
- `pnpm run typecheck` passes after codegen runs with annotated routes present

**Verification:** `pnpm run codegen` succeeds; `mcp.tools.generated.ts` imports only modules with `mcp:`-annotated routes; typecheck passes.

---

### U4. Annotate matters routes

**Goal:** `list_matters`, `get_matter`, `create_matter`, `update_matter` exposed as MCP tools via route annotations.

**Dependencies:** U1

**Files:**
- `src/modules/matters/routes/core.routes.ts` (modify — add `mcp` to 4 routes)

**Approach:**

Add `mcp` annotation to:
- `listMattersRoute`: `scope: 'matters:read'`, handler calls `mattersService.listMatters(args, ctx)`
- `getMatterRoute`: `scope: 'matters:read'`, handler calls `mattersService.getMatter(args, ctx)`
- `createMatterRoute`: `scope: 'matters:write'`, handler calls `mattersService.createMatter({ data: args }, ctx)`
- `updateMatterRoute`: `scope: 'matters:write'`, handler calls `mattersService.updateMatter({ data: args }, ctx)`

Each handler must import the service at the top of the route file (or the file already imports it — check).

**Note:** Handler `args` for list/get routes may need `practice_id` and `matter_id` extracted from args — the schema shape will include these as params. Check `listMattersQuerySchema` and `getMatterRequest` types to see what the handler needs.

**Patterns to follow:** `src/modules/matters/services/matters.service.ts` function signatures

**Test scenarios:**
- `pnpm run typecheck` passes after annotation
- Running `buildMcpToolsFromModule(mattersRoutes)` returns tools for the 4 annotated routes
- Tool names derived: `list_matters`, `get_matter`, `create_matter`, `update_matter`
- Scopes match: `matters:read` for list/get, `matters:write` for create/update

**Verification:** After codegen, `MCP_TOOLS_REGISTRY` contains 4 matters tools.

---

### U5. Annotate clients routes

**Goal:** `list_clients`, `get_client` exposed as MCP tools.

**Dependencies:** U1

**Files:**
- `src/modules/clients/routes.ts` (modify — add `mcp` to 2 routes)

**Approach:**

Add `mcp` to:
- `listClientsRoute`: `scope: 'clients:read'`, handler calls clients service list function
- `getClientRoute`: `scope: 'clients:read'`, handler calls clients service get function

**Patterns to follow:** `src/modules/clients/services/` for service function signatures

**Test scenarios:**
- Typecheck passes
- `buildMcpToolsFromModule` returns 2 tools
- Tool names: `list_clients`, `get_client`

**Verification:** After codegen, `MCP_TOOLS_REGISTRY` contains 2 clients tools.

---

### U6. Annotate invoices routes

**Goal:** `list_invoices`, `get_invoice` exposed as MCP tools.

**Dependencies:** U1

**Files:**
- `src/modules/invoices/routes.ts` (modify — add `mcp` to 2 routes; note: route consts are `const`, not `export const` — may need to make them exported or export via the `routes` object)

**Approach:**

Add `mcp` to:
- `listInvoicesRoute`: `scope: 'invoices:read'`
- `getInvoiceRoute`: `scope: 'invoices:read'`

Check: invoices route consts are currently not individually exported — they're collected into `export const routes = {}`. The generated file uses `import *` and accesses `mod.routes`, so the `routes` object export is sufficient.

**Patterns to follow:** `src/modules/invoices/services/` for service function signatures

**Test scenarios:**
- Typecheck passes
- `buildMcpToolsFromModule` returns 2 tools
- Tool names: `list_invoices`, `get_invoice`

**Verification:** After codegen, `MCP_TOOLS_REGISTRY` contains 2 invoices tools.

---

### U7. Wire up generated file + delete placeholder

**Goal:** `server.ts` imports `MCP_TOOLS_REGISTRY` from generated file. Placeholder `mcp.tools.ts` deleted.

**Dependencies:** U2, U3, U4, U5, U6

**Files:**
- `src/modules/mcp/server.ts` (modify — change import)
- `src/modules/mcp/mcp.tools.ts` (delete)
- `src/modules/mcp/mcp.tools.generated.ts` (commit initial generated output)

**Approach:**

In `server.ts`, replace:
```
import { allTools } from '@/modules/mcp/mcp.tools';
```
with:
```
import { MCP_TOOLS_REGISTRY } from '@/modules/mcp/mcp.tools.generated';
```
and update `registerTools(server, jwt, allTools)` → `registerTools(server, jwt, MCP_TOOLS_REGISTRY)`.

Delete `src/modules/mcp/mcp.tools.ts`.

Run `pnpm run codegen` to produce the final generated file. Commit the generated file.

**Test scenarios:**
- `pnpm run typecheck` passes
- `pnpm run codegen` is idempotent (running twice produces same file)
- `MCP_TOOLS_REGISTRY` has the expected 8 tools (4 matters + 2 clients + 2 invoices)

**Verification:** Typecheck passes; codegen is clean; `server.ts` compiles without errors.

---

## Deferred to Implementation

- Exact TypeScript generic signature for `routeBuilder.build()` return type when `mcp` is present vs. absent — implementer to decide cleanest generic intersection
- Whether `matters/routes/core.routes.ts` already imports service or needs new import at top of file
- Exact service function call signatures for handler args (implementer verifies against service types)
- Whether path normalization in `deriveToolName` should strip `/{practice_id}` or handle it differently for modules that don't use that prefix pattern
