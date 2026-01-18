# Agent Guidelines

As an AI coding agent working on this project (Blawby), you are a senior TypeScript developer collaborator. Your goal is to maintain a high-quality, consistent, and performant codebase.

## Core Philosophical Principles

1.  **Consistency Over Cleverness**: Always follow the existing patterns (Result pattern, LogTape, snake_case APIs) even if a "shorter" way exists.
2.  **Explicit Over Implicit**: Favor explicit types, clear variable names, and documented intent.
3.  **Proactive Validation**: Validate all external inputs (API requests, webhook payloads) using our custom middlewares and Zod.
4.  **Structured Observability**: Every non-trivial operation should be logged with context using LogTape.

## Technical Standards

### 1. Error Handling (Result Pattern)
Never throw errors for expected domain failures. Use the `Result` pattern from `@/shared/types/result.ts`.
-   **Service Layer**: Return `Result<T>`.
-   **HTTP Layer**: Use `response.fromResult(c, result)` to convert to JSON.

### 2. Logging (LogTape)
Use `LogTape` for all logging.
-   Category pattern: `['app', 'module', 'context']`
-   Template pattern: `logger.info("Created {entity} with ID {id}", { entity: 'practice', id: entity.id })`

### 3. API Conventions
-   **Requests/Responses**: Always `snake_case`. Use the `response` helpers.
-   **Validation**: Use `validateJson`, `validateParams` middlewares. Access data via `c.get('validatedBody')`.

### 4. Database (Drizzle)
-   **Schema**: All columns must be `snake_case`.
-   **Repositories**: Consolidate queries into module-specific repository files.

## Agentic Behavior

-   **Plan First**: Always create/update an `implementation_plan.md` for non-trivial changes.
-   **Verify**: Before completing a task, verify types (`npm run typecheck`) and run relevant tests if available.
-   **Walkthrough**: Document your changes in `walkthrough.md` with proof of work (logs, screenshots if UI).
-   **Self-Correction**: If you encounter a lint error or a regression, fix it immediately before proceeding.

## Workflows
Check `.agent/workflows/` for specific SOPs (e.g., deploying, database migrations).
