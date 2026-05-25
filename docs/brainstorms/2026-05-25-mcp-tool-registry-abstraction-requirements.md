# MCP Tool Registry Abstraction

**Created:** 2026-05-25
**Status:** active

## Problem

Adding MCP tools for a new module currently requires:
1. Creating `src/modules/mcp/tools/<module>.ts` with a `registerXxxTools(server, jwt)` function
2. Editing `src/modules/mcp/server.ts` to import and call it

Scope checks, `ServiceContext` construction, and error handling are duplicated across every tool file. The file layout is a parallel structure that diverges from where module code actually lives.

## Goal

Make adding MCP tools for a new module a single-file operation: drop `src/modules/<mod>/mcp.tools.ts` and it is automatically discovered, registered, and handled — no other files touched.

## Decisions

### Tool definition contract

Each tool is described by a plain data object with four fields:
- `name` — tool name string
- `description` — human-readable description
- `schema` — Zod raw shape (same format as `server.tool()` accepts today)
- `scope` — single scope string (e.g. `'matters:read'`); single string only, no multi-scope for now (no use case exists)
- `handler` — async function receiving typed args + `ServiceContext`, returns any value

A `defineTool()` factory preserves generic type inference on the schema/handler pair while erasing the type to `AnyToolDef` for storage in arrays.

### Central registry handles all boilerplate

`registerTools(server, jwt, tools)` — called once in `createMcpServer` — handles for every tool:
1. **Scope check**: if `getMcpScopes(jwt)` doesn't include `tool.scope`, return `{ isError: true, content: [{ text: 'Forbidden: missing scope <scope>' }] }` immediately
2. **ServiceContext construction**: call `buildMcpServiceContext(jwt)` once per tool invocation
3. **Handler call**: `tool.handler(args, ctx)`
4. **Error catch**: wrap handler call in try/catch; any thrown error → `{ isError: true, content: [{ text: error.message }] }`
5. **Success**: `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`

Individual tool handlers are pure business logic only — no scope checks, no context building, no error handling.

### Auto-discovery via codegen

Extend `scripts/codegen.ts` with a `generateMcpToolsRegistry()` function that:
- Runs in the same `Promise.allSettled([...])` block as existing generators (no separate pass)
- For each discovered module, checks `existsSync(join(MODULES_DIR, mod, 'mcp.tools.ts'))` — same pattern as `routes.config.ts`
- Imports only modules that have the file
- Emits `src/modules/mcp/mcp.tools.generated.ts` with a `MCP_TOOLS_REGISTRY: AnyToolDef[]` export

`server.ts` imports `MCP_TOOLS_REGISTRY` from the generated file only. It never changes when modules are added or removed.

### File layout after refactor

```
scripts/codegen.ts                         ← add generateMcpToolsRegistry()

src/modules/mcp/
  types.ts                                 ← McpJwt, AnyToolDef interfaces
  tool-registry.ts                         ← defineTool(), registerTools()
  mcp-context.ts                           ← unchanged
  mcp.tools.generated.ts                   ← auto-generated, committed to git
  server.ts                                ← simplified: imports MCP_TOOLS_REGISTRY
  index.ts                                 ← unchanged

src/modules/matters/mcp.tools.ts           ← mattersTools: AnyToolDef[]
src/modules/clients/mcp.tools.ts           ← clientsTools: AnyToolDef[]
src/modules/invoices/mcp.tools.ts          ← invoicesTools: AnyToolDef[]

DELETE: src/modules/mcp/tools/             ← entire directory removed
```

### Generated file is committed to git

Consistent with `modules.generated.ts` and `configs.generated.ts`.

## Acceptance Criteria

- Adding MCP tools for a new module requires only creating `src/modules/<mod>/mcp.tools.ts` and running codegen
- `server.ts` does not need to be edited when adding or removing a module's tools
- Scope check failure returns `isError: true` with a message naming the missing scope
- Service errors (any thrown exception) return `isError: true` with the error message, not an unhandled rejection
- Tool handler functions contain no scope checks, no `buildMcpServiceContext` calls, no try/catch
- `pnpm run typecheck` passes
- All existing MCP tool behavior is preserved (list/get/create/update for matters, clients, invoices)

## Scope Boundaries

**In scope:**
- `defineTool()` factory + `AnyToolDef` type
- `registerTools()` central handler
- `generateMcpToolsRegistry()` codegen function
- Migration of 3 existing tool files into module-co-located `mcp.tools.ts`

**Out of scope:**
- Multi-scope gating (e.g., requiring two scopes simultaneously)
- Streaming or long-running tools
- Tool versioning
- Runtime/dynamic plugin loading
- Changes to non-MCP module structure

**Deferred — route-to-tool derivation (follow-up PR):**

Auto-generate `mcp.tools.ts` from existing OpenAPI route definitions. Approach decided:
- Add optional `mcp: { scope: string }` annotation to `routeBuilder.build()` config
- Routes without `mcp` are not exposed
- Codegen reads route files at build time, extracts Zod schemas, derives tool name from method + path, emits `mcp.tools.ts`
- Tool name convention: `GET /` → `list_<module>`, `POST /` → `create_<module>`, `GET /:id` → `get_<module>`, `PATCH|PUT /:id` → `update_<module>`, `DELETE /:id` → `delete_<module>`
- Nested routes (`/:id/tasks`) deferred further — naming convention unresolved
