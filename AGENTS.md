# Blawby Backend Agent Guide

This is the canonical repository guidance for coding agents. Tool-specific files should only point here and contain genuinely tool-specific instructions.

For concrete code examples and known cleanup rules to apply when touching existing files, see [`docs/CODING_STANDARDS.md`](./docs/CODING_STANDARDS.md).

## Project

Blawby is a legal-practice management backend for matters, clients, billing, invoices, subscriptions, trust accounting, and practice administration.

- Runtime: Node.js `>=25.8.1`, ESM, TypeScript
- Package manager: pnpm `11.3.0`
- HTTP: Hono with `@hono/zod-openapi`
- Database: PostgreSQL with Drizzle ORM
- Authentication: Better Auth
- Authorization: CASL
- Jobs: Graphile Worker
- Logging: LogTape
- Tests: Vitest; some suites use Tap assertions under Vitest
- Formatting and linting: oxfmt and oxlint

## Working Method

1. Read the relevant implementation, call sites, tests, and current git diff before editing.
2. Verify conventions from current code instead of historical plans or examples.
3. Before adding shared infrastructure, retry handling, wrappers, or abstractions, inspect at least two comparable modules and follow the established project pattern.
4. Prefer the smallest change that fully fixes the behavior. Do not preserve complexity solely because tests were built around it.
5. Work with existing uncommitted changes. Never revert unrelated user changes.
6. Ask only when missing information cannot be discovered and a reasonable assumption would be risky.
7. Finish with focused validation and review the final diff for dead code and accidental scope expansion.

## Evidence Before Action

Before changing docs, plans, GitHub issues, or code from a written claim, verify the claim against current reality. For each non-trivial item, identify the claim, check at least one current source, and then decide the action.

Acceptable evidence sources:

- Current implementation files, call sites, schemas, routes, generated registries, or tests
- Current git diff for files already in motion
- Current GitHub issues or PRs when triaging external work
- Runtime/config files when the claim is about commands, services, deployment, or infrastructure

Do not mark work complete, stale, safe to delete, or ready to implement from plan text alone. If a claim cannot be verified quickly, leave it as "needs triage" instead of guessing.

For doc cleanup and issue creation, use this loop:

1. Extract the claim from the document.
2. Verify it against code, tests, config, or issues.
3. Choose one action: keep, update, archive, delete, or convert to an issue.
4. Record concise evidence in the edited doc, issue body, or final response.

## Source Of Truth

Use sources in this order:

1. Current code and tests
2. This `AGENTS.md`
3. Current architecture documentation under `docs/`
4. Active plans explicitly identified by the user
5. [`docs/CODING_STANDARDS.md`](./docs/CODING_STANDARDS.md) for examples and touched-file cleanup checks
6. Historical plans and specs, which are context rather than current rules

When documentation conflicts with the implementation, verify the intended direction before performing a broad migration. Do not revive patterns found only in historical documents.

## Commands

```bash
pnpm run dev
pnpm run dev:full
pnpm run typecheck
pnpm run format
pnpm run format:check
pnpm run lint
pnpm run test
pnpm run build
pnpm run db:generate
pnpm run db:migrate
pnpm run sync:listeners
```

Run focused tests while iterating. Run broader tests when changing shared behavior, cross-module contracts, event processing, database infrastructure, or queues.

## Core Conventions

### Imports And Types

- Use `@/` aliases for project imports. Do not introduce `./` or `../` imports in `src/`.
- Use `import type` for type-only imports.
- Do not use explicit `any`; use domain types, generics, or `unknown` with narrowing.
- Do not use `as` type assertions to coerce values, especially double assertions like `value as unknown as Type`. Prefer type guards, Zod parsing, typed helpers, generics, `satisfies`, or narrowing from `unknown`; remove nearby unsafe assertions when touching code.
- When types are missing, create the local/domain type or ask to install the package's official typings. Do not replace missing types with `any`, `unknown as`, or broad assertions.
- Keep shared types in dedicated type files when they are reused or form a module contract.
- Use `snake_case` for API payloads, database columns, and event payloads.
- Use `camelCase` for internal variables, functions, and service parameters.

### Validation And HTTP

- Import `z` from `@hono/zod-openapi` for application validation.
- Use Zod v4 forms such as `z.uuid()` and `z.iso.datetime()`.
- Build OpenAPI routes with `routeBuilder.build(...)`.
- Use `practice_id` in organization-scoped API paths even though the database column is `organization_id`.
- Keep handlers thin: read validated input, obtain `ServiceContext`, call a service, and return `c.json(...)`.
- Do not catch service errors in handlers unless the route has a specific recovery requirement.
- List responses must use the shared pagination shapes: offset lists return `{ data, pagination }`; cursor lists return `{ data, page_info }`.

### Services And Errors

- Prefer separate `const` functions exported through a service object.
- For standard services, use a parameter object plus `ServiceContext` when that matches the surrounding module.
- Return data directly. Do not introduce service response wrapper objects.
- Use `HTTPException` for expected HTTP failures and raw `Error` for unexpected failures.
- Webhook and worker failures must propagate when retry infrastructure depends on thrown errors.
- Preserve error causes when wrapping unexpected failures.
- Perform CASL authorization checks at the established service boundary.

### Database

- Keep Drizzle schemas under each module's `database/schema/` directory and queries under `database/queries/`.
- Use `uow.transaction(...)` for application transaction boundaries. Do not introduce direct `db.transaction(...)` in module code unless you are changing the UoW infrastructure itself.
- Use `getActiveTx()` inside repositories/helpers so the same code works inside and outside an active unit of work.
- Dispatch state-dependent events transactionally with the corresponding database mutation.
- In `*.schema.ts` files, import referenced tables from their concrete schema modules rather than barrel exports to avoid ESM cycles.
- Generate and inspect migrations when schema definitions change. Never hand-edit generated metadata unless the repository workflow requires it.

### Events And Jobs

- Define events under `src/shared/events/definitions/` and listeners in module `listeners.ts` files.
- Event listeners should generally translate events into focused work or enqueue jobs.
- Let Graphile Worker own execution retries: worker tasks should throw on retryable failures.
- Avoid custom retry orchestration when a dedicated idempotent job already models the operation.
- Use stable job keys or deduplication identifiers for externally visible side effects.

### Logging

- Use LogTape via `getLogger([...])`; do not add `console.log` or `console.error`.
- Use structured placeholders and include identifiers needed to diagnose failures.
- Avoid logging and swallowing errors that callers or workers must observe.

## Module Shape

Follow the local module before assuming every module has every file:

```text
src/modules/<module>/
  index.ts
  http.ts
  handlers.ts
  routes/
  services/
  database/schema/
  database/queries/
  types/
  validations/
  listeners.ts
```

Generated registries and listener registration are maintained by repository scripts. Check generated-file headers before editing them manually.

## Testing And Validation

For code changes, normally run:

```bash
pnpm run typecheck
pnpm run format:check
pnpm run lint
```

Also run the smallest relevant Vitest command. If Vitest assertions pass but the process fails because of a worker-pool or teardown problem, report both facts accurately rather than claiming a clean pass.

For database changes, also run `pnpm run db:generate` and inspect the migration. For build or generated-registration changes, run the relevant generation command and `pnpm run build`.

## Documentation Hygiene

- Keep this file concise and current; do not copy it into tool-specific instruction files.
- Put reusable agent workflows in `.agents/skills/` only when they contain real procedure, references, or scripts beyond these repository conventions.
- Treat `plans/` and `docs/**/plans/` as historical unless the user identifies a plan as active.
- Treat historical plans as leads, not proof. Search the relevant current module, tests, and issues before executing, deleting, or rewriting a plan item.
- GitHub issues created from old docs must include a checklist and a short "Verified current state" or "Evidence" section with file or issue references.
- Update architecture documentation when a change alters module ownership, event flow, queue ownership, or a public contract.
