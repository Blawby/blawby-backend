# MCP

## Purpose

The Model Context Protocol endpoint exposes authorized Blawby backend operations as tools that compatible AI clients can discover and invoke. It allows an AI client to work with live practice data without bypassing existing service-layer tenancy and authorization rules.

## Status

**Implemented.**

The current implementation provides an authenticated Streamable HTTP MCP endpoint, generated tool registration from annotated routes, a canonical workflow prompt registry, per-tool scope enforcement, and explicit approval for tools configured as requiring confirmation.

This status does not imply that every Blawby feature or every natural-language intelligence workflow is available as an MCP tool.

## Actors

- **Practice user** — authorizes an MCP client to access permitted practice data.
- **MCP client** — a compatible AI application that connects to the Blawby MCP endpoint.
- **Blawby authorization server** — issues and validates access tokens through Better Auth.
- **Blawby MCP server** — validates the token, registers allowed tools, and dispatches tool calls to backend services.

## Preconditions

- The application base URL is configured.
- The MCP client has obtained a valid bearer token from the Blawby authorization flow.
- The token issuer matches `${baseUrl}/api/auth`.
- The token audience includes `${baseUrl}/mcp`.
- The token contains the scope required by the requested tool.
- The authenticated identity can resolve to a valid Blawby service context.

## User workflow

1. The MCP client discovers or is configured with the Blawby MCP endpoint at `/mcp`.
2. The user authorizes the client through the Better Auth OAuth provider flow.
3. The client sends MCP requests with the bearer token.
4. The server validates the JWT using the configured JWKS endpoint, issuer, and audience.
5. A new MCP server instance is created for the request.
6. Generated tool definitions are registered.
7. The client lists or invokes an available tool.
8. The client may list or render a canonical workflow prompt such as `new_client_intake` or `conflict_check`.
9. The server verifies the tool scope.
10. When the tool requires approval, the server asks the MCP client to elicit explicit confirmation.
11. The server builds the authenticated service context and invokes the tool handler.
12. The result is returned as MCP text content containing serialized JSON.

## Business rules

- MCP tools are created only from routes with a valid MCP annotation.
- Organization-scoping path fields such as `practice_id` and `organization_id` are excluded from the exposed input schema. Practice context must come from authenticated context rather than caller-controlled organization identifiers.
- Tool input schemas are derived from explicitly supplied MCP schemas or from route query, path, and JSON body schemas.
- Tool names may be explicit or derived from the route method and path.
- Read routes normally derive names such as `list_<resource>` or `get_<resource>`.
- Create, update, and delete routes normally derive names such as `create_<resource>`, `update_<resource>`, and `delete_<resource>`.
- A tool call without its required scope must fail before the handler executes.
- A tool configured with required approval must not execute unless the elicited `confirm` value is `true`.
- Handler exceptions are converted into MCP error results rather than escaping as unhandled server errors.

## Permissions

Authorization has two layers:

1. **MCP scope authorization** — the JWT must contain the scope declared by the tool.
2. **Application authorization** — the service and repository layers continue to enforce identity, practice membership, ownership, and other backend authorization rules.

Possession of a broad MCP connection token must not grant cross-practice access. Tool handlers must use the service context built from the validated token.

## States and transitions

The MCP transport is stateless in the current implementation because the Streamable HTTP transport is created without a session ID generator.

A tool invocation can transition through:

```text
received
  → rejected: invalid authentication
  → rejected: missing scope
  → awaiting approval
      → rejected: declined
      → rejected: cancelled
      → rejected: invalid approval response
      → executing
  → executing
      → succeeded
      → failed
```

## Data ownership

MCP does not own a separate product-data domain. It exposes operations backed by existing Blawby modules and their existing PostgreSQL records.

MCP-specific code owns:

- JWT-to-service-context translation;
- tool registration;
- tool schema and name derivation;
- scope checks;
- approval elicitation;
- MCP result formatting;
- workflow prompt definitions, validation, rendering, and docs derivation;
- HTTP transport handling.

## API surface

- **Endpoint:** `/mcp`
- **Methods:** all MCP transport requests accepted by the mounted handler
- **Authentication:** bearer token validated through Better Auth OAuth-provider middleware
- **JWKS:** `${baseUrl}/api/auth/jwks`
- **Expected issuer:** `${baseUrl}/api/auth`
- **Expected audience:** `${baseUrl}/mcp`
- **Transport:** MCP Streamable HTTP using the web-standard transport

The exact tool inventory is generated from annotated backend routes and should be inspected through MCP tool discovery or the generated registry rather than duplicated manually in this document.

Canonical workflow prompts are defined in `workflow-registry.ts`. MCP prompt registration and public documentation helpers consume those same definitions; operational database fields such as intake-template `prompt_hint` remain field-level guidance rather than a second workflow source of truth.

## Side effects

A tool can produce any side effect allowed by its underlying route handler, including database mutations, emails, jobs, events, payments, or audit records.

Mutation tools requiring human confirmation must declare approval metadata. Approval protects execution but does not replace backend validation, authorization, idempotency, or audit requirements.

## Failure behavior

The MCP server returns error tool results for:

- missing required tool scope;
- approval declined by the user;
- approval cancelled by the user;
- an unexpected approval action;
- approval content without `confirm: true`;
- handler or service exceptions.

Authentication failures occur before the MCP request handler is invoked and are handled by the Better Auth MCP middleware.

The current error result contains a human-readable message. Internal secrets, tokens, SQL, and sensitive stack details must not be exposed through tool errors.

## Security and compliance

- JWT signature validation uses the configured Better Auth JWKS endpoint.
- Issuer and audience are validated.
- Tool scopes are enforced before service-context construction and handler execution.
- Practice identifiers are not accepted as caller-controlled MCP inputs when they are organization-scoping route parameters.
- Sensitive mutations may require explicit MCP approval.
- Existing backend authorization and audit behavior remains mandatory.
- Tool descriptions and schemas must not expose secrets or internal-only data fields.

## Known limitations

- MCP availability does not mean all practice data or workflows have MCP tools.
- Natural-language matter intelligence and proactive recommendations are separate product capabilities and may remain partial or planned.
- The transport is currently stateless.
- Tool success output is serialized JSON inside MCP text content rather than richer typed MCP content.
- Approval behavior depends on the connected MCP client supporting elicitation.
- There is no manually maintained tool catalogue in this document because the registry is generated and can change with route annotations.
- The initial workflow prompt set covers new-client intake and conflict checks; additional workflows should be added only when their referenced tools and guardrails are real.

## Acceptance criteria

- `/mcp` accepts authenticated MCP Streamable HTTP requests.
- A token with an invalid issuer or audience is rejected.
- A tool cannot run without its declared scope.
- A tool requiring approval cannot run after decline, cancellation, or a false confirmation.
- An approved tool executes with a service context derived from the validated token.
- Organization-scoping path parameters are absent from generated tool input schemas.
- Annotated route query, non-organization path, and JSON-body schemas are represented in the generated input schema.
- Handler failures are returned as MCP error results.
- Tool discovery reflects the generated tool registry.
- Prompt discovery exposes the canonical workflow registry, rejects unknown tools during server creation, and renders required arguments explicitly.

## Code ownership

Primary implementation:

- `src/modules/mcp/index.ts` — authenticated HTTP mounting and JWT validation configuration.
- `src/modules/mcp/server.ts` — MCP server and Streamable HTTP transport creation.
- `src/modules/mcp/tool-registry.ts` — tool generation, registration, scope checks, approval, and result formatting.
- `src/modules/mcp/workflow-registry.ts` — canonical agent-facing workflow definitions, validation, rendering, and docs output.
- `src/modules/mcp/workflow-prompts.ts` — MCP prompt registration.
- `src/modules/mcp/mcp-context.ts` — MCP scope and service-context handling.
- `src/modules/mcp/mcp.tools.generated.ts` — generated current tool registry.
- `src/modules/mcp/types.ts` — MCP-specific types.
- `src/hono-app.ts` — mounts the MCP application at `/mcp`.
- `scripts/codegen.ts` — MCP registry generation integration.

Tests and validation:

- `test/modules/mcp/tool-registry.test.ts`
- `test/scripts/test-mcp-local.sh`

## Maintenance rule

Update this specification whenever a change modifies MCP authentication, scopes, approvals, transport behavior, schema generation, tenancy behavior, error semantics, or the rules determining which routes become tools.
