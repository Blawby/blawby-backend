# MCP Server — PR 1 Requirements

**Date:** 2026-05-25  
**Scope:** Backend MCP server + core tools + scope enforcement  
**Depends on:** PR #216 (OAuth provider, merged)

---

## Goal

Claude Desktop can authenticate via Blawby's OAuth provider and call MCP tools to read/write matters, clients, and invoices. Scope and role enforcement match the existing API — no more, no less access than an equivalent session-based request.

---

## Auth Flow (per tool call)

Each tool invocation goes through this sequence:

1. `mcpHandler` (from `@better-auth/oauth-provider`) validates Bearer token → returns `JWTPayload`
2. Extract `userId` from `jwt.sub`
3. Extract `organizationId` from JWT — **implementation note:** verify which claim carries the orgId (`clientReference` is set in `oauthProvider` config; confirm it lands in the JWT payload during implementation)
4. Check required scope from `jwt.scope` (or `jwt.scopes`) — throw 403 if missing
5. Query `members` table for `(userId, organizationId)` → get `role`
6. `defineAbilityFor(role)` → build CASL ability
7. `createServiceContext({ userId, user, organizationId, memberRole: role, ability, requestHeaders: {} })`
8. Call existing service — CASL record-level checks apply identically to session-based requests

**Why full CASL:** Services use `toSubject('Matter', record)` for record-level checks (e.g., `matters.service.ts:123`). Without the real role, those checks either silently over-grant or fail. Scope gates the resource type; CASL gates specific records within that type.

---

## Acceptance Criteria

- `GET /mcp` (or any `/mcp` request) without Bearer token → 401 with `WWW-Authenticate: Bearer resource_metadata=...`
- Token with `matters:read` only → calling `list_invoices` returns 403
- Token with `matters:read` + `member` role → only sees matters that role permits (CASL enforced)
- Claude Desktop can complete full flow: OAuth sign-in → `list_matters` → see org matters
- `create_matter` with token missing `matters:write` → 403

---

## Files to Touch

| File | Change |
|------|--------|
| `package.json` | Add `@modelcontextprotocol/sdk` |
| `src/shared/auth/better-auth.http.ts` | Mount `/.well-known/oauth-protected-resource/mcp` discovery endpoint; apply `mcpHandler` to `/mcp/*` |
| `src/modules/mcp/index.ts` | New — exports Hono handler that wraps `mcpHandler` |
| `src/modules/mcp/server.ts` | New — `McpServer` instance + tool registration |
| `src/modules/mcp/tools/matters.ts` | New — `list_matters`, `get_matter`, `create_matter`, `update_matter_status` |
| `src/modules/mcp/tools/clients.ts` | New — `list_clients`, `get_client` |
| `src/modules/mcp/tools/invoices.ts` | New — `list_invoices`, `get_invoice` |
| `src/hono-app.ts` | Direct registration (not auto-discovery) — `app.all('/mcp/*', mcpIndex)` |

**Not touched:** `better-auth.ts` — scopes are per-client in the `oauthClient` DB record, not in the server config.

---

## Module Structure

```
src/modules/mcp/
  index.ts       — Hono handler: bridges mcpHandler → McpServer.fetch()
  server.ts      — McpServer instance, registers all tools
  tools/
    matters.ts   — list_matters, get_matter, create_matter, update_matter_status
    clients.ts   — list_clients, get_client
    invoices.ts  — list_invoices, get_invoice
```

The MCP module does **not** go through `registerModuleRoutes()` — that auto-discovery is for standard OpenAPI modules. Register directly in `hono-app.ts` like `registerAuthRoutes`.

---

## Scope Definitions

Enforced per-tool in `tools/*.ts` files. Scopes registered on the Claude Desktop `oauthClient` DB record (not in `oauthProvider` server config):

| Scope | Tools |
|-------|-------|
| `matters:read` | `list_matters`, `get_matter` |
| `matters:write` | `create_matter`, `update_matter_status` |
| `clients:read` | `list_clients`, `get_client` |
| `invoices:read` | `list_invoices`, `get_invoice` |

---

## Key Corrections to Original Plan

| Plan says | Reality |
|-----------|---------|
| `mcpAuthHono` from `better-auth/plugins/mcp/client/adapters` | Use `mcpHandler` from `@better-auth/oauth-provider` (already installed) |
| Module registered via `registerModuleRoutes()` | Direct registration in `hono-app.ts` — MCP has no OpenAPI routes |
| Add scopes array to `oauthProvider` config | Scopes live on the `oauthClient` DB record per client, not in server config |

---

## Out of Scope (PR 1)

- Consent UI (PR 2)
- Connection listing / revocation (PR 3)
- Any MCP tools beyond matters, clients, invoices
- Streaming / SSE transport (HTTP-only for now)
