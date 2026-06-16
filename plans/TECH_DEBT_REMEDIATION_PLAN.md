# Tech Debt Remediation Plan

> **Goal:** Make the codebase readable, standardized, and easy for any new developer to understand.
> **Branch:** `refactor/tech-debt`
> Testing infrastructure is tracked on a separate branch — excluded from this plan.

---

## The Standard

Every module should look and feel the same. The **matters**, **preferences**, and **invoices** modules are the gold standard for **structure** (CASL, ServiceContext, thin handlers). The error-handling migration is complete; keep new and touched code throw-based. Here's the target pattern:

### Handler Pattern

```typescript
// handlers.ts — thin, no business logic, just wiring
const createThingHandler: AppRouteHandler<typeof routes.createThingRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');

  const thing = await thingService.createThing({ data: body }, ctx); // throws on error
  return c.json(thing, 201);
};
```

**Rules:**

- Always use `getServiceContext(c)` — never extract `user`, `orgId`, `headers` manually
- Never write `if (!user) return response.unauthorized(c)` — middleware handles auth
- Pass params as an object + `ctx` — never positional args
- Handlers should be 3-8 lines, no business logic
- Use native Hono `c.json(...)` for all JSON responses

### Service Pattern

```typescript
// thing.service.ts — business logic, max ~200 lines per file
// Returns data directly or throws HTTPException for errors
const createThing = async (
  { data }: { data: CreateThingRequest },
  ctx: ServiceContext,
): Promise<ThingRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Thing');

  return await uow.transaction(async () => {
    const [newRecord] = await getActiveTx().insert(things).values({ ... }).returning();
    if (!newRecord) {
      throw new HTTPException(500, { message: 'Failed to create Thing' });
    }
    await ctx.emit(ThingCreated, { ... });
    return newRecord;
  });
};
```

**Rules:**

- Max 2 parameters: `(params, ctx)` — params is an object, ctx is ServiceContext
- Return data directly — do not return service response wrapper objects
- Throw `HTTPException` for expected failures (404, 400, etc.) from service layer
- CASL check first, then validate, then execute
- Max ~50 lines per function — if longer, extract helpers
- Max ~200 lines per service file — split into sub-services when it grows

### Paginated Response Pattern

```typescript
// For offset-based pagination
const listThingsHandler: AppRouteHandler<typeof routes.listThingsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const response = await thingService.listThings(query, ctx); // throws on error
  return c.json(response);
};
```

**Rules:**

- Use the standardized `OffsetPaginatedResponse<T>` or `CursorPaginatedResponse<T>` interfaces from `@/shared/types/pagination`
- Never manually calculate `total_pages` in the handler — the service should return the complete `pagination` or `page_info` metadata
- JSON responses for lists must always have the primary data array in a `data` field (not module-specific names like `matters` or `invoices`)

### Route Pattern

```typescript
// routes.ts — OpenAPI definitions, max ~300 lines per file
export const createThingRoute = routeBuilder.build(
  createRoute({ method: 'post', path: '/', ... })
);
```

### http.ts Pattern

```typescript
import * as handlers from './handlers';
import * as routes from './routes';

const app = createHonoApp();
app.use('*', injectAbility());
app.openapi(routes.createThingRoute, handlers.createThingHandler);
export default app;
```

---

## Error Handling Standard

**Status:** Complete. Standardize on Hono's native throw-based error handling.

### Expected Failure Mapping

| Situation | Throw Pattern | Status |
| --- | --- | --- |
| Not found | `throw new HTTPException(404, { message })` | 404 |
| Bad input | `throw new HTTPException(400, { message })` | 400 |
| Unauthorized | `throw new HTTPException(401, { message })` | 401 |
| Conflict | `throw new HTTPException(409, { message })` | 409 |
| Unprocessable | `throw new HTTPException(422, { message })` | 422 |
| Unexpected server failure | `throw new Error(message)` | 500 |

### Special Cases (Webhooks & Workers)

Webhook services called by job queues (e.g., Graphile Worker) should **not** use `HTTPException`. They should throw raw `Error` objects to trigger standard job retry logic.

---

## Module Migration Checklist

```
### Module: [name]

**Handlers:**
- [ ] Rewrite all handlers to use `getServiceContext(c)`
- [ ] Remove all `if (!user)` checks
- [ ] Remove all manual `c.get('user')` / headers extraction
- [ ] Every handler is 3-8 lines, no business logic

**Services:**
- [ ] Convert all functions to `(params, ctx: ServiceContext)` — max 2 args
- [ ] Add `ForbiddenError.from(ctx.ability).throwUnlessCan(...)` as first line
- [ ] Return data directly from every function — throw `HTTPException` for expected failures
- [ ] Remove all `requestHeaders` parameters
- [ ] Split any service file >200 lines
- [ ] Split any function >50 lines

**Routes:**
- [ ] Migrate to `routeBuilder.build()` (auto error schemas)
- [ ] Split any routes file >300 lines

**http.ts:**
- [ ] Wire `injectAbility()` middleware

**Verify:**
- [ ] `npx tsc --noEmit` compiles clean
- [ ] Every handler uses `getServiceContext(c)`
- [ ] Every service function has max 2 params: `(params, ctx)`
- [ ] No file >200 lines in services/
- [ ] No function >50 lines
```

---

## PR Phases

Each phase is a self-contained PR that compiles clean and merges independently.
PRs within a group can be developed **in parallel**.

### Branch Status Snapshot (2026-03-28)

Verified completed on current branch:

- [x] `injectAbility()` wired in `src/modules/dev/http.ts`, `src/modules/public/http.ts`, and `src/modules/webhooks/http.ts`
- [x] `src/modules/onboarding/http.handlers.ts` renamed to `src/modules/onboarding/handlers.ts`
- [x] `src/modules/uploads/routes.ts` split into `upload-read.routes.ts` and `upload-write.routes.ts`
- [x] No `throw new Error()` remains in `src/modules/uploads/services/*.ts`
- [x] `pnpm run typecheck` currently passes

Remaining high-priority work from this snapshot:

- [ ] Remove remaining `if (!user)` checks in `src/modules/clients/services/clients-crud.service.ts` (2 occurrences)
- [ ] Remove remaining `requestHeaders` usage in `src/modules/subscriptions/services/subscription.service.ts` (2 occurrences)
- [x] Migrate all modules to Hono native throw-based pattern
- [ ] Remove legacy `src/modules/uploads/services/uploads.service.ts` after fully moving references

---

### ✅ Foundation — Merged

- [x] CASL ability definitions, `injectAbility` middleware, `OrgRole` enum
- [x] `ServiceContext` type + `getServiceContext` + `ctx.emit()`
- [x] `routeBuilder.build()` with auto error schemas
- [x] Global `ForbiddenError` handler, `toSubject()` helper
- [x] Core Error Handling Part 1: Unified `errorHandler.ts` + `HTTPException` metadata support
- [x] `matterId` added to `ServiceContext`
- [x] Delete `routing.service.ts` + all `computeRoutingClaims` usages

---

### ✅ PR-0 — Matters (Gold Standard)

- [x] Sub-services migrated to `ServiceContext` + CASL
- [x] All functions use params objects + `ctx`
- [x] Handlers are thin, use `getServiceContext(c)`
- [x] Routes split into `routes/` directory (7 files, all <300 lines)
- [x] `matter-tasks` removed (unused)

**Nice-to-have** (defer — acceptable as-is):

- [ ] `matters.service.ts` (410 lines), `matter-milestones.service.ts` (368), `matter-time-entries.service.ts` (311), `matter-expenses.service.ts` (284) — could split but core CRUD is acceptable

---

### ✅ PR-1 — Invoices

- [x] `injectAbility()` wired, all handlers thin with `getServiceContext(c)`
- [x] Split `invoices.service.ts` (562 lines) → 4 focused services (83–247 lines each)
- [x] CASL checks in all services, `({ data }, ctx)` pattern throughout
- [x] Removed `computeRoutingClaims`, refund-requests, `listeners.ts`
- [x] Routes at 149 lines

**Nice-to-have** (defer):

- [ ] `invoice-webhooks.service.ts` (348 lines) — webhook handler, may not need ServiceContext
- [ ] `invoice-stripe-coordination.service.ts` (247 lines), `stripe-invoices.service.ts` (209 lines) — slightly over 200

---

## Group A — Module Standardization

> All PRs in this group are **independent of each other** — modules don't import each other's services.
> Develop and review in parallel; merge order doesn't matter within the group.

---

### PR-2 — Practice Module

**Files:** `src/modules/practice/`

- [x] Wire `injectAbility()` in `http.ts`
- [x] Rewrite handlers to use `getServiceContext(c)` (thin handlers)
- [x] Remove all `if (!user)` checks in handlers
- [x] Split old services:
  - `practice.service.ts` → `practice-management.service.ts`, `practice-queries.service.ts`, `practice-management.helpers.ts`
  - `practice-details.service.ts` behavior folded into split services above
- [x] Split routes into focused files:
  - `practice.routes.ts`
  - `practice-details.routes.ts`
- [x] Add CASL checks in practice mutation/query services (admin writes, read-gated queries)
- [x] Convert service signatures to `(params, ctx)` for practice services
- [x] **Migrate handlers/services to throw-based error pattern**
- [x] **Event definitions** (`src/shared/events/definitions/practice.ts`):
  - [x] Add typed payloads to `PracticeMemberInvited` and `PracticeMemberJoined` — DONE
  - [x] Simplify `PracticeDetailsUpsertedPayload` — DONE
- [x] **Note:** Better Auth wrapper calls keep `requestHeaders` param (required by `betterAuth.api.*`) as an explicit exception in practice types/services

**Status:** ✅ **COMPLETE** — Migrated to throw-based error handling

---

### PR-3 — Practice-Client-Intakes Module

**Files:** `src/modules/practice-client-intakes/`

- [x] Fully replace legacy `practice-client-intakes.service.ts`
  - [x] Extract route-facing services: `intake-creation.service.ts`, `intake-checkout.service.ts`, `intake-lifecycle.service.ts`
  - [x] Extract shared helpers: `intake-access.helpers.ts`, `intake-shared.helpers.ts`
  - [x] Move core DB + Stripe orchestration out of the legacy service into the extracted services/helpers
- [ ] Extract Stripe logic into dedicated helpers (not mixed with DB + validation)
- [ ] Flatten nested code (4+ levels deep) into early-return + helper functions
- [x] Wire `injectAbility()` in `http.ts`
- [x] Rewrite handlers to use `getServiceContext(c)` and thin `(params, ctx)` service entrypoints
- [x] Add CASL ownership/staff access checks
- [ ] **Migrate handlers/services to throw-based error pattern**
- [x] Split large routes file into logical groups:
  - `routes/public.routes.ts`
  - `routes/client.routes.ts`
  - `routes/staff.routes.ts`
  - `routes/shared.ts`
- [x] Remove raw `Headers` passthrough from intake invitation flow (minimal origin-only header passed to Better Auth)
- [ ] Replace base64url-encoded `PrefillData` in magic-link `callbackURL` with an opaque, short-lived server-side token (store minimal payload in DB/Redis, pass only the token ID in the URL, validate/consume on callback)
- [ ] Move `convertIntake` eligibility checks (`status`, `triage_status`, metadata) inside `uow.transaction(...)` with `SELECT … FOR UPDATE` on the intake row to prevent race-condition duplicates

---

### ✅ PR-4 — User-Details Module

**Files:** `src/modules/clients/` (migrated scope)

- [x] Wire `injectAbility()` in `http.ts`
- [x] Rewrite handlers to use `getServiceContext(c)`
- [x] Convert service from `(orgId, data, actorId)` → `({ data }, ctx)`
- [x] Split `user-details.service.ts` (543 lines) → `user-details-crud.service.ts`, `user-details-stripe.service.ts`
- [x] Add CASL ownership checks
- [x] Remove `if (!user)` checks
- [x] **Migrate handlers/services to throw-based error pattern**
- [x] Extract `resolveUserForIntake` to `user-details-utils.ts`

**Status:** ✅ **COMPLETE** — Migrated to throw-based error handling

---

### PR-5 — Uploads Module

**Files:** `src/modules/uploads/`

- [x] Wire `injectAbility()` in `http.ts`
- [x] **Fix error handling in uploads services**: remove direct `throw new Error()` usage in `src/modules/uploads/services/*.ts`
- [ ] Finalize migration and delete legacy `uploads.service.ts` (still present)
- [x] Extract storage provider logic (R2 vs Images) into `storage-provider.service.ts`
- [x] Add CASL per-resource permission checks
- [ ] **Migrate handlers/services to throw-based error pattern**
- [x] Split `uploads.routes.ts` (405 lines) into logical groups

---

### PR-6 — Subscriptions Module

**Files:** `src/modules/subscriptions/`

- [ ] Wire `injectAbility()`, adopt `getServiceContext(c)`, convert to `(params, ctx)`
- [ ] Split `subscription.service.ts` (341 lines), trim `meteredProducts.service.ts` (259 lines)
- [ ] Replace try/catch blocks with direct Result returns where possible
- [ ] Add CASL checks (admin-only for management)
- [ ] Remove `requestHeaders` params

---

### ✅ PR-7 — Onboarding Module

**Files:** `src/modules/onboarding/`

- [x] Rename `http.handlers.ts` → `handlers.ts`
- [x] Wire `injectAbility()`, adopt `getServiceContext(c)` + `(params, ctx)`
- [x] Add CASL checks (admin-only)
- [ ] **Migrate handlers/services to throw-based error pattern**
- [x] Remove `requestHeaders` params

**Status:** Closed (no further required items in this PR scope)

---

### PR-8 — Stripe Module (Re-scope Needed)

**Files:** `src/modules/stripe/`

- [ ] Re-scope this PR based on current repo contents (module now includes `http.ts`, `handlers.ts`, `routes/`, and `services/`)
- [ ] If customer logic was moved, update target paths before implementation

---

### PR-9 — Trust Module

**Files:** `src/modules/trust/`

- [x] Wire `injectAbility()`, adopt `getServiceContext(c)` + `(params, ctx)`
- [ ] Add CASL checks (admin manage, member read)
- [x] Fix stale `@/shared/auth/services/routing.service` import in `handlers.ts`

---

### ✅ PR-10 — Remaining Modules

**Files:** `src/modules/webhooks/`, `src/modules/public/`, `src/modules/dev/`

- [x] Review if CASL applies (system-initiated modules may not need it)
- [x] Ensure consistent structure where applicable

**Status:** Closed (no further required items in this PR scope)

---

## Group B — Cross-Cutting Cleanup

> Wait until **all Group A PRs are merged** before starting — these touch files across multiple modules.

---

### ✅ PR-11 — CASL Subject Expansion

**Dependencies:** All Group A merged

- [x] Add `Invoice` subject — admin: manage, member: read, client: read own
- [x] Add `Subscription` subject — admin: manage, member: read
- [x] Add `Upload` subject — admin: manage, member: create+read, client: read own
- [x] Add `UserDetails` subject — admin: manage, member: read own, client: read own
- [x] Add `Onboarding` subject — admin: manage
- [x] Add `Trust` subject — admin: manage, member: read

**Status:** Closed (no further required items in this PR scope)

---

### PR-12 — Type Safety Sweep (Eliminate `as` Assertions)

**Dependencies:** All Group A merged

**A. Services: Remove unsafe type assertions**

- [ ] Audit and fix all unsafe `as` casts in services, especially `as unknown as` double assertions
- [ ] When touching a file, replace nearby unsafe assertions with narrowing, schemas, predicates, typed helpers, explicit types, or `satisfies`
- [ ] Add missing domain/package types instead of replacing type gaps with `any` or assertions

**B. Repositories: Add explicit return types**

```typescript
const findMatterById = async (id: string): Promise<MatterWithRelations | undefined> => { ... };
```

- [ ] Define `WithRelations` types per module, add explicit return types to all relational queries

**C. JSON columns: Use `.$type<T>()`**

```typescript
notifications: jsonb('notifications').$type<NotificationPreferences>(),
```

- [ ] Preferences schema (`notifications`, `onboarding`, `display`), audit all other JSON columns

**D. Stripe webhooks: Type-narrow instead of cast**

```typescript
// Before: const product = event.data.object as Stripe.Product;
// After: discriminated union narrowing via Stripe SDK
```

- [ ] Audit webhook handlers in subscriptions and invoices

---

### PR-13 — Dead Code Cleanup

**Dependencies:** All Group A merged

- [x] Delete 5 unused practice events: `PracticeSpecialtiesUpdated`, `PracticeContactInfoUpdated`, `PracticeMemberRoleChanged`, `PracticeMemberRemoved`, `PracticeMemberLeft` — remove from definitions file and barrel export
- [ ] Verify all `if (!user)` checks are gone (should be 0 after Group A)
- [x] Fix `requireAdmin` TODO in `src/shared/middleware/requireAuth.ts:82`
- [x] Audit `getFullOrganization` calls used only for auth → replace with CASL
- [ ] Delete any remaining dead code from old authorization approach

---

### PR-16 — Response Utility Consistency Cleanup

**Dependencies:** All Group A merged

- [x] Remove legacy handler response utilities from active code paths
- [ ] Keep payload-builder utilities (if needed), avoid response wrappers that return `any`
- [ ] Remove temporary Oxlint rule overrides added for `no-unsafe-return`/unsafe assertions after migration
- [x] Update current handler pattern examples to use direct `c.json(...)` responses

---

## Group C — Infrastructure

> Independent of Groups A and B — can be started at any time.

---

### ✅ PR-14 — Env Config Centralization

**Dependencies:** None

- [x] Create `src/shared/config/index.ts` — Zod schema, validate at startup
- [x] Replace all `process.env` reads across 24 files with typed config imports
- [x] Harden async event dispatch: replace fire-and-forget `setImmediate`, add dead-letter retry

**Status:** Closed (no further required items in this PR scope)

---

### PR-15 — TSConfig Hardening

**Dependencies:** All other PRs merged (needs clean codebase to enable strict checks)

- [ ] Enable `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` in `tsconfig.json`
- [ ] Clean up remaining `any` type usages (currently 6 files)
- [ ] Remove unused `HandlerOptions` fields in event types
- [ ] Fix relative imports in all event definition files (`../event` → `@/shared/events/event`)
- [ ] Standardize codegen workflow (`pnpm codegen` + pre-commit hook)
- [ ] Consolidate schema locations (4 places → 2)

---

## Parallel Work Map

```
✅ Foundation  →  ✅ PR-0 Matters  →  ✅ PR-1 Invoices
                                              │
         ┌────────────────────────────────────┘
         │
         │  Group A  (all parallel, no dependencies between them)
         ├─ PR-2   Practice
         ├─ PR-3   Practice-Client-Intakes
         ├─ PR-4   User-Details
         ├─ PR-5   Uploads
         ├─ PR-6   Subscriptions
         ├─ PR-7   Onboarding
         ├─ PR-8   Stripe Customers
         ├─ PR-9   Trust
         └─ PR-10  Remaining
                   │
                   │  all merged
                   │
         ┌─────────┴──────────────────┐
         │  Group B  (parallel)       │
         ├─ PR-11  CASL Expansion     │
         ├─ PR-12  Type Safety Sweep  │
         └─ PR-13  Dead Code Cleanup  │
                   │                  │
                   └────────┬─────────┘
                            │  all merged
                        PR-15 TSConfig

PR-14 (Env Config) ── independent, merge any time
```

---

## Size Reference

### God Services (>200 lines)

| File                                     | Lines   | Target PR  |
| ---------------------------------------- | ------- | ---------- |
| `uploads.service.ts`                     | **633** | PR-5       |
| `user-details.service.ts`                | **543** | PR-4       |
| `practice.service.ts`                    | **507** | PR-2       |
| `stripe-customer.service.ts`             | **417** | PR-8       |
| `matters.service.ts`                     | **410** | Acceptable |
| `practice-details.service.ts`            | **369** | PR-2       |
| `matter-milestones.service.ts`           | **368** | Acceptable |
| `invoice-webhooks.service.ts`            | **348** | Post PR-1  |
| `subscription.service.ts`                | **341** | PR-6       |
| `matter-time-entries.service.ts`         | **311** | Acceptable |
| `matter-expenses.service.ts`             | **284** | Acceptable |
| `meteredProducts.service.ts`             | **259** | PR-6       |
| `invoice-stripe-coordination.service.ts` | **247** | Post PR-1  |
| `trust.service.ts`                       | **240** | PR-9       |

### God Route Files (>300 lines)

| File                 | Lines   | Target PR |
| -------------------- | ------- | --------- |
| `practice.routes.ts` | **869** | PR-2      |
| `uploads.routes.ts`  | **405** | PR-5      |

---

## Metrics

| Metric                          | Before   | Now                                                                     | Target            |
| ------------------------------- | -------- | ----------------------------------------------------------------------- | ----------------- |
| Modules using `ServiceContext`  | 2        | **6** (matters, preferences, invoices, user-details, practice, clients) | all               |
| Modules using CASL              | 2        | **6**                                                                   | all authenticated |
| Modules using Throw-based Error | 1        | **3** (stripe, practice, clients)                                       | all               |
| Service files >200 lines        | 9        | **~11** (uploads, subscription, meteredProducts, trust, matters\*)      | **0**             |
| Route files >300 lines          | 3        | **1** (uploads.routes.ts)                                               | **0**             |
| `if (!user)` checks             | ~50      | **0**                                                                   | **0**             |
| `computeRoutingClaims` usages   | ~15      | **0**                                                                   | **0**             |
| `requestHeaders` params         | ~20      | **~5** (better-auth exceptions, subscriptions)                          | **0**             |
| Direct `process.env` reads      | 70 files | **24 files**                                                            | **0**             |
| `any` type usages               | 23 files | **5 files**                                                             | **0**             |
| `as` type assertions            | many     | many                                                                    | **0**             |

\*Note: matters module services >200 lines are acceptable as noted in PR-0
