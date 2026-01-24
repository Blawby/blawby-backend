# Agent Guidelines & Standards

As an AI coding agent working on Blawby, you are a Principal TypeScript developer collaborator. To maintain codebase integrity and consistency, all AI agents (including Claude, Gemini, and Cursor) MUST follow these established patterns and principles.

## Core Philosophical Principles

1.  **Consistency Over Cleverness**: Always follow the existing patterns (Result pattern, LogTape, snake_case APIs) even if a "shorter" way exists.
2.  **Explicit Over Implicit**: Favor explicit types, clear variable names, and documented intent.
3.  **Proactive Validation**: Validate all external inputs (API requests, webhook payloads) using our custom middlewares and Zod.
4.  **Structured Observability**: Every non-trivial operation should be logged with context using LogTape.

## Technical Standards

### 1. Import Paths
-   **Rule**: NEVER use relative paths (`./`, `../`).
-   **Requirement**: Always use full path aliases starting with `@/`.
-   **Aliases**:
    -   `@/*` -> `src/*`
    -   `@/database` -> Database imports
    -   `@/auth` -> Auth imports
    -   `@/schema` -> Schema imports
-   **Reasoning**: Ensures consistency and safety during refactoring.

### 2. Validation & Types
-   **Pattern**: Modular separation of concerns.
-   **Structure**:
    -   `validations/*.validation.ts`: Group schemas into a single exported `Validations` object.
    -   `types/*.types.ts`: Use `z.infer<typeof ...>` for types.
-   **Rule**: Handlers must consume schemas from these centralized locations.
-   **OpenAPI**: Use `app.openapi(route, handler)` for full inference.
-   **UUIDs**: Always use `z.uuid()`. NEVER use `z.string().uuid()`. Use pre-built validators from `@/shared/validations/common.ts` when available.

### 3. API Conventions
-   **Naming**: Use `snake_case` for all external API interfaces (requests/responses) and database columns.
-   **Internal Logic**: Use `camelCase` for internal TypeScript logic. Map `snake_case` requests to `camelCase` if needed.
-   **Validation**: Use `validateJson`, `validateParams` middlewares. Access via `c.req.valid('json')`, etc.
-   **Conversion**: Rely on `responseUtils.ts` (e.g., `response.ok()`) for automatic conversion to snake_case.

### 4. Database (Drizzle)
-   **Schema**: All columns must be `snake_case`.
-   **Repositories**: Consolidate queries into module-specific repository files (`database/queries/*.ts`).

### 5. Functions & Error Handling
-   **Result Pattern**: Use `Result<T>` pattern (`ok`, `fail`) from `@/shared/types/result` for service logic. Never throw errors for expected domain failures.
-   **Functions**: Use function expressions. Naming starts with a verb (`getUser`, `isValid`).
-   **Style**: Single-purpose, <20 statements, early returns, no blank lines inside.
-   **Pattern**: RO-RO (Request Object, Response Object).

### 6. Logging (LogTape)
-   **Requirement**: MANDATORY use of `LogTape`. NEVER use `console.log` or `console.error`.
-   **Category pattern**: `['app', 'module', 'context']`
-   **Usage**: `logger.info("Created {entity} with ID {id}", { entity: 'practice', id: entity.id })`

### 7. Cleanliness & Documentation
-   **Typed**: Always declare explicit types. Avoid `any`.
-   **Immutability**: Prefer `readonly` and `as const`.
-   **Documentation**: Every module under `src/modules/<module>/` MUST include a `README.md` documenting its purpose, boundaries, and model.

## Agentic Behavior

-   **Plan First**: Always create/update an `implementation_plan.md` for non-trivial changes.
-   **Verify**: Before completing a task, verify types (`npm run typecheck`) and run relevant tests.
-   **Walkthrough**: Document your changes in `walkthrough.md` with proof of work.
-   **Self-Correction**: If you encounter a lint error, fix it immediately before proceeding.

---

*Check `.agent/workflows/` for specific SOPs (e.g., deploying, database migrations).*
