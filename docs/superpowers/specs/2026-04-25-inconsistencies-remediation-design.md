# Inconsistencies Remediation Design

> Audited: 2026-04-24. Design finalized: 2026-04-25.
> Source of truth: `docs/superpowers/inconsistencies-audit.md`

## Goal

Bring the entire Blawby backend codebase into conformance with CLAUDE.md standards across error handling, API surface, and structural conventions. This unifies the existing API standardization plans with the new audit items into a single sequenced backlog.

---

## Structure

Three sequential tracks. Track 3 does not start until Track 2 ships. Within Track 3, all items run in parallel worktrees via `dispatching-parallel-agents`.

An index document (`docs/superpowers/inconsistencies-remediation-index.md`) is the single entry point for any agent starting work — it maps the full sequence, marks parallelizable steps, and tracks completion status across all plans.

---

## Track 1 — Foundation (Error Handling Migration)

**Prerequisite for everything else.** 26 files across 6 modules still use the old `Result<T>` / `sendResult` pattern. Until this is done, subsequent cleanup touches the same files twice.

### Module order (sequential)

1. `matters` — largest module, sets the pattern for all others
2. `trust` — has custom `assertTrust*Access()` helpers that return `Result<void>` instead of throwing
3. `subscriptions` — handlers and services both affected
4. `practice-client-intakes` — most files affected; intake helpers use `Result<T>` heavily
5. `stripe` — smaller surface, verify webhook/worker services use raw `Error` (not `HTTPException`) for retry logic
6. `onboarding` — smallest, clean up last

Plus one standalone item:

7. `engagement-contracts` — add `practice_id` URL param validation against `ctx.organizationId` in service (audit item 2, remaining task)

### Per-module migration pattern

Each module plan executes the same steps:

1. **Service layer** — replace `Result<T>` returns with direct returns. Remove `try/catch` blocks that convert errors to `Result<never>`. Replace `return { success: false, error }` with `throw new HTTPException(status, { message })`. For delete operations, change `Promise<Result<{ success: true }>>` to `Promise<void>`.
2. **Handler layer** — replace `sendResult(c, result)` with direct `return c.json(data, status)`. For deletes, return `c.body(null, 204)`. Remove all `Result<T>` unwrapping.
3. **Trust-specific** — convert `assertTrustManageAccess()` / `assertTrustReadAccess()` to `void` functions that throw instead of returning `Result<void>`.
4. **Typecheck gate** — `pnpm run typecheck` must pass before the plan is marked complete.

### Overlap with Track 2

Track 1 absorbs the DELETE→204 handler changes for modules it touches (`matters`, `trust`, `subscriptions`, `practice-client-intakes`). Track 2 `api-breaking-standardization.md` Task 1 must skip those modules. The index doc marks this explicitly to prevent double-work.

### Plan files (to be created)

| Plan file | Module |
|-----------|--------|
| `plans/error-handling-matters.md` | `matters` |
| `plans/error-handling-trust.md` | `trust` |
| `plans/error-handling-subscriptions.md` | `subscriptions` |
| `plans/error-handling-practice-client-intakes.md` | `practice-client-intakes` |
| `plans/error-handling-stripe.md` | `stripe` |
| `plans/error-handling-onboarding.md` | `onboarding` |
| `plans/engagement-contracts-practice-id-validation.md` | `engagement-contracts` |

---

## Track 2 — API Surface (Existing Plans, Coordinated Release)

Resume the two existing plans. These are breaking API changes — ship them together in a single coordinated release with the frontend.

| Plan file | Status | Notes |
|-----------|--------|-------|
| `plans/2026-04-03-api-non-breaking-fixes.md` | 8 done / 17 pending | Resume as-is |
| `plans/2026-04-03-api-breaking-standardization.md` | 18 done / 39 pending | Skip Task 1 for modules already migrated in Track 1 |

Track 2 covers: DELETE→204 (remaining modules), list response envelopes, REST verb fixes, param renames (`{id}` → `{matter_id}` etc.), `{uuid}` → `{practice_id}` in practice routes.

---

## Track 3 — Structural Cleanup (After Track 2 Ships)

All items are independent. Run in parallel worktrees via `dispatching-parallel-agents`. Each item gets its own focused plan.

### Items

#### 3a. Handler export style (audit item 3)
Migrate `clients` and `practice` from individual named exports to `export const handlers = { ... }`. Mechanical, no logic changes. Update `http.ts` references in both modules.

#### 3b. File and directory naming (audit item 4)
- Rename `invoices/schemas/` → `invoices/validations/`
- Move `preferences/schema/preferences.schema.ts` into the existing `preferences/validations/` directory, then delete the empty `preferences/schema/` dir
- Rename all `.repository.ts` files → `.queries.ts` (modules: `practice`, `invoices`, `onboarding`, `subscriptions`, `practice-client-intakes`)
- Rename camelCase service files in `subscriptions/services/` to kebab-case: `meteredProducts.service.ts`, `subscriptionWebhooks.service.ts`, `syncPlans.service.ts`
- Update all import paths after renames.

#### 3c. Misplaced files (audit item 5)
- Move `invoices/services/invoice-lifecycle.handlers.ts` and `invoice-metering.handlers.ts` to `invoices/workers/` (Graphile Worker task handlers, not service files)
- Move `invoices/refund-requests.handlers.ts` and `invoices/refund-requests.routes.ts` into `invoices/routes/refund-requests.routes.ts` and fold handlers into `invoices/handlers.ts`

#### 3d. Orphaned event files (audit item 6)
- Register `src/shared/events/definitions/engagement-contracts.ts` in `definitions.ts` and `EventClasses` map
- Investigate `src/shared/events/definitions/clients.ts` — determine if `UserDetails*` events are needed; if yes rename and register, if no delete
- Move `src/modules/practice/events/practice.events.types.ts` content to `src/shared/events/definitions/practice.ts` and delete the module-local file

#### 3e. Preferences handler rewrite (audit item 8)
Full rewrite of `src/modules/preferences/handlers.ts`:
- Type all handlers as `AppRouteHandler<typeof route>`
- Replace `c.req.param('category')` with `c.req.valid('param')`
- Remove inline validation logic (`isValidPreferenceCategory()`, `parseCategoryPayload()`) — move to validation schema
- Replace `{ error: '...' }` returns with `throw new HTTPException(...)`

#### 3f. Zod direct imports (audit item 10)
Mechanical find-replace in 6 files: replace `from 'zod'` with `from '@hono/zod-openapi'`. Files:
- `preferences/schema/preferences.schema.ts` (moves to `preferences/validations/` in 3b)
- `preferences/validations/preferences.validation.ts`
- `onboarding/schemas/onboarding.schema.ts`
- `practice-client-intakes/services/intake-stripe.helpers.ts`
- `subscriptions/types/subscription.types.ts`
- `practice/types/practice.types.ts`

#### 3g. Datetime validation (audit item 9)
Audit all `z.date()` usages in API schemas (request/response). Replace with `z.iso.datetime({ offset: true })`. `z.date()` is only valid in internal/DB types, not API schemas.

#### 3h. Service size splits (audit item 7)
Review each oversized service file. Only split when distinct responsibilities can be cleanly separated:

| File | Lines | Split candidate? |
|------|-------|-----------------|
| `invoices/services/refund-requests.service.ts` | 599 | Yes — refund lifecycle vs. validation |
| `clients/services/clients-crud.service.ts` | 564 | Evaluate |
| `matters/services/matters.service.ts` | 556 | Evaluate |
| `engagement-contracts/services/engagement-contract.service.ts` | 460 | Evaluate post-Track-1 |
| `subscriptions/services/subscription.service.ts` | 443 | Evaluate post-Track-1 |

Do not split mechanically. Each file gets an explicit judgment: is there a clean boundary, or is it just long?

#### 3i. Events without listeners (audit item 11)
Investigate only — no code changes until confirmed:
- Verify `trust/` events are handled by a global/shared listener (not silently dropped)
- Verify `subscriptions/` events are handled similarly
- Document findings. Only add `listeners.ts` if events are genuinely unhandled.

### Plan files (to be created)

| Plan file | Item |
|-----------|------|
| `plans/cleanup-handler-exports.md` | 3a |
| `plans/cleanup-file-naming.md` | 3b |
| `plans/cleanup-misplaced-files.md` | 3c |
| `plans/cleanup-orphaned-events.md` | 3d |
| `plans/cleanup-preferences-handler.md` | 3e |
| `plans/cleanup-zod-imports.md` | 3f |
| `plans/cleanup-datetime-validation.md` | 3g |
| `plans/cleanup-service-sizes.md` | 3h |
| `plans/cleanup-events-no-listeners.md` | 3i |

---

## Index Document

`docs/superpowers/inconsistencies-remediation-index.md` will be created as a living checklist:

```
Track 1 (sequential — complete in order)
  [ ] error-handling-matters.md
  [ ] error-handling-trust.md
  [ ] error-handling-subscriptions.md
  [ ] error-handling-practice-client-intakes.md
  [ ] error-handling-stripe.md
  [ ] error-handling-onboarding.md
  [ ] engagement-contracts-practice-id-validation.md

Track 2 (coordinated release with frontend)
  [ ] 2026-04-03-api-non-breaking-fixes.md (resume)
  [ ] 2026-04-03-api-breaking-standardization.md (resume, skip Task 1 for Track-1 modules)

Track 3 (parallel — after Track 2 ships)
  [ ] cleanup-handler-exports.md
  [ ] cleanup-file-naming.md
  [ ] cleanup-misplaced-files.md
  [ ] cleanup-orphaned-events.md
  [ ] cleanup-preferences-handler.md
  [ ] cleanup-zod-imports.md
  [ ] cleanup-datetime-validation.md
  [ ] cleanup-service-sizes.md
  [ ] cleanup-events-no-listeners.md
```

---

## Success Criteria

- `pnpm run typecheck` passes after every plan
- `pnpm run format:check` passes after every plan
- No `sendResult`, `Result<T>` in module handler or service files
- All module handlers typed as `AppRouteHandler<typeof route>`
- All imports use `@/` path aliases
- All `z` imports from `@hono/zod-openapi`
- All API date fields use `z.iso.datetime({ offset: true })`
- `inconsistencies-audit.md` fully marked ✅
