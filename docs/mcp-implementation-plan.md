# Blawby MCP Implementation Plan

## Context

OAuth 2.1 provider is live (PR #216 merged). Blawby can now issue tokens to external apps.
Goal: expose Blawby data to Claude Desktop and other MCP clients via authenticated MCP tools.

---

## PR 1 — MCP Server + Core Tools + Scope Enforcement

**Goal:** Claude Desktop can connect to Blawby, call scoped tools to read/write matters, clients, invoices.

### Files touched (~9 files, 5 new)

| File | Change |
|------|--------|
| `package.json` | add `@modelcontextprotocol/sdk` |
| `src/shared/auth/better-auth.ts` | add scopes array to `oauthProvider` config |
| `src/shared/auth/better-auth.http.ts` | add `mcpAuthHono` middleware + discovery routes |
| `src/modules/mcp/index.ts` | new — registers MCP HTTP handler |
| `src/modules/mcp/server.ts` | new — McpServer instance + tool registration |
| `src/modules/mcp/tools/matters.ts` | new — matters tools + scope checks |
| `src/modules/mcp/tools/clients.ts` | new — clients tools + scope checks |
| `src/modules/mcp/tools/invoices.ts` | new — invoices tools + scope checks |
| `hono-app.ts` | register mcp module |

### What to build

**1. MCP auth middleware** in `src/shared/auth/better-auth.http.ts`
- Mount `/.well-known/oauth-protected-resource/mcp` discovery endpoint (RFC 9728)
- Use `mcpHandler` from `@better-auth/oauth-provider` (not `mcpAuthHono`) for Bearer token validation

**2. Custom scopes** in `src/shared/auth/better-auth.ts`
```
matters:read, matters:write
clients:read
invoices:read, invoices:write
```

**3. New module: `src/modules/mcp/`**

Tool registry abstraction (`defineTool` + `registerTools`) centralises scope checks, `ServiceContext` construction, and error handling. Individual tool files are pure business logic. Module-local `mcp.tools.ts` files are auto-discovered by codegen in a follow-up PR.

```
src/modules/mcp/
  index.ts            — registers MCP HTTP handler at /mcp (Bearer via mcpHandler)
  server.ts           — McpServer instance + registerTools call
  tool-registry.ts    — defineTool(), registerTools(), AnyToolDef
  mcp.tools.ts        — placeholder; populated by codegen once module tools exist
  mcp-context.ts      — JWT → ServiceContext (DB members lookup, CASL ability)
  types.ts            — local McpJwt interface (avoids direct jose dep)
```

Future module tools live co-located:
```
src/modules/matters/mcp.tools.ts
src/modules/clients/mcp.tools.ts
src/modules/invoices/mcp.tools.ts
```

**4. Each tool:**
- Scope check handled by `registerTools()` — returns `isError: true` if missing
- `ServiceContext` built from JWT in `buildMcpServiceContext`
- Calls existing services (matters, clients, invoices)
- Returns structured MCP tool response via `JSON.stringify(result)`

### Acceptance criteria
- Claude Desktop can sign in via OAuth → call `list_matters` → see org matters
- `GET /mcp` returns 401 without Bearer token
- Token with `matters:read` only cannot call invoice tools (returns isError scope message)
- Codegen auto-discovery deferred to PR 1.5 — adding `mcp.tools.ts` to a module + running codegen is the only step required

---

## PR 2 — Frontend Consent Page

**Goal:** Users see a proper OAuth consent screen when authorizing Claude Desktop or other MCP clients.

> _Sections for PR 2 and PR 3 need to be filled in — content was not recovered from the original file._

---

## PR 3 — Connection Management

**Goal:** Users can view and revoke active MCP client connections from their settings.

> _Content to be filled in._
