# Tech Debt Remediation Plan

> **Goal:** Make the codebase readable, standardized, and easy for any new developer to understand.
> **Branch:** `refactor/casl-rbac-clean-architecture`
> Testing infrastructure is tracked on a separate branch — excluded from this plan.

---

## The Standard

Every module should look and feel the same. The **matters**, **preferences**, and **invoices** modules are the gold standard after refactoring. Here's the pattern every module must follow:

### Handler Pattern

```typescript
// handlers.ts — thin, no business logic, just wiring
const createThingHandler: AppRouteHandler<typeof routes.createThingRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');

  const result = await thingService.createThing({ data: body }, ctx);
  return response.fromResult(c, result, 201);
};
```

**Rules:**
- Always use `getServiceContext(c)` — never extract `user`, `orgId`, `headers` manually
- Never write `if (!user) return response.unauthorized(c)` — middleware handles auth
- Pass params as an object + `ctx` — never positional args
- Handlers should be 3-8 lines, no business logic

### Service Pattern

```typescript
// thing.service.ts — business logic, max ~200 lines per file
const createThing = async (
  { data }: { data: CreateThingRequest },
  ctx: ServiceContext,
): Promise<Result<ThingRecord>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Thing');

  const record = await db.transaction(async (tx) => {
    const [newRecord] = await tx.insert(things).values({ ... }).returning();
    await ctx.emit(ThingCreated, { ... }, tx);
    return newRecord;
  });

  return result.ok(record);
};
```

**Rules:**
- Max 2 parameters: `(params, ctx)` — params is an object, ctx is ServiceContext
- Always return `Result<T>` — never throw for expected failures, never try/catch for control flow
- CASL check first, then validate, then execute
- Max ~50 lines per function — if longer, extract helpers
- Max ~200 lines per service file — split into sub-services when it grows

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
- [ ] Return `Result<T>` from every function — no `throw` for expected failures
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

---

### ✅ Foundation — Merged

- [x] CASL ability definitions, `injectAbility` middleware, `OrgRole` enum
- [x] `ServiceContext` type + `getServiceContext` + `ctx.emit()`
- [x] `routeBuilder.build()` with auto error schemas
- [x] Global `ForbiddenError` handler, `toSubject()` helper
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
- [ ] **Event definitions** (`src/shared/events/definitions/practice.ts`):
  - [x] Add typed payloads to `PracticeMemberInvited` and `PracticeMemberJoined` — DONE
  - [x] Simplify `PracticeDetailsUpsertedPayload` — DONE
- [x] **Note:** Better Auth wrapper calls keep `requestHeaders` param (required by `betterAuth.api.*`) as an explicit exception in practice types/services

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
- [x] Split large routes file into logical groups:
  - `routes/public.routes.ts`
  - `routes/client.routes.ts`
  - `routes/staff.routes.ts`
  - `routes/shared.ts`
- [x] Remove raw `Headers` passthrough from intake invitation flow (minimal origin-only header passed to Better Auth)
- [ ] Replace base64url-encoded `PrefillData` in magic-link `callbackURL` with an opaque, short-lived server-side token (store minimal payload in DB/Redis, pass only the token ID in the URL, validate/consume on callback)
- [ ] Move `convertIntake` eligibility checks (`status`, `triage_status`, metadata) inside `db.transaction` with `SELECT … FOR UPDATE` on the intake row to prevent race-condition duplicates

---

### PR-4 — User-Details Module

**Files:** `src/modules/user-details/`

- [x] Wire `injectAbility()` in `http.ts`
- [x] Rewrite handlers to use `getServiceContext(c)`
- [x] Convert service from `(orgId, data, actorId)` → `({ data }, ctx)`
- [x] Split `user-details.service.ts` (543 lines) → `user-details-crud.service.ts`, `user-details-stripe.service.ts`
- [x] Add CASL ownership checks
- [x] Remove `if (!user)` checks
- [x] Extract `resolveUserForIntake` to `user-details-utils.ts`

---

### PR-5 — Uploads Module

**Files:** `src/modules/uploads/`

- [ ] Wire `injectAbility()` in `http.ts`, convert to `(params, ctx)`
- [ ] **Fix error handling**: replace all `throw new Error()` with `return result.badRequest()`/`result.fail()`
- [ ] Split `uploads.service.ts` (633 lines) → `upload-presign.service.ts`, `upload-confirm.service.ts`, `upload-queries.service.ts`
- [ ] Extract storage provider logic (R2 vs Images) into `storage-provider.service.ts`
- [ ] Add CASL per-resource permission checks
- [ ] Split `uploads.routes.ts` (405 lines) into logical groups

---

### PR-6 — Subscriptions Module

**Files:** `src/modules/subscriptions/`

- [ ] Wire `injectAbility()`, adopt `getServiceContext(c)`, convert to `(params, ctx)`
- [ ] Split `subscription.service.ts` (341 lines), trim `meteredProducts.service.ts` (259 lines)
- [ ] Replace try/catch blocks with direct Result returns where possible
- [ ] Add CASL checks (admin-only for management)
- [ ] Remove `requestHeaders` params

---

### PR-7 — Onboarding Module

**Files:** `src/modules/onboarding/`

- [ ] Rename `http.handlers.ts` → `handlers.ts`
- [ ] Wire `injectAbility()`, adopt `getServiceContext(c)` + `(params, ctx)`
- [ ] Add CASL checks (admin-only)
- [ ] Remove `requestHeaders` params

---

### PR-8 — Stripe Module (Re-scope Needed)

**Files:** `src/modules/stripe/`

- [ ] Re-scope this PR based on current repo contents (currently only `listeners.ts` exists under `src/modules/stripe/`)
- [ ] If customer logic was moved, update target paths before implementation

---

### PR-9 — Trust Module

**Files:** `src/modules/trust/`

- [ ] Wire `injectAbility()`, adopt `getServiceContext(c)` + `(params, ctx)`
- [ ] Add CASL checks (admin manage, member read)
- [ ] Fix stale `@/shared/auth/services/routing.service` import in `handlers.ts`

---

### PR-10 — Remaining Modules

**Files:** `src/modules/webhooks/`, `src/modules/public/`, `src/modules/dev/`

- [ ] Review if CASL applies (system-initiated modules may not need it)
- [ ] Ensure consistent structure where applicable

---

## Group B — Cross-Cutting Cleanup

> Wait until **all Group A PRs are merged** before starting — these touch files across multiple modules.

---

### PR-11 — CASL Subject Expansion

**Dependencies:** All Group A merged

- [ ] Add `Invoice` subject — admin: manage, member: read, client: read own
- [ ] Add `Subscription` subject — admin: manage, member: read
- [ ] Add `Upload` subject — admin: manage, member: create+read, client: read own
- [ ] Add `UserDetails` subject — admin: manage, member: read own, client: read own
- [ ] Add `Onboarding` subject — admin: manage
- [ ] Add `Trust` subject — admin: manage, member: read

---

### PR-12 — Type Safety Sweep (Eliminate `as` Assertions)

**Dependencies:** All Group A merged

**A. Services: Use `result.ok<T>()`**
```typescript
// Before: return result.ok({ ...matter, assignees } as MatterRecord);
// After:  return result.ok<MatterRecord>({ ...matter, assignees });
```
- [ ] Audit and fix all `as SomeRecord` casts in services

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

- [ ] Delete 5 unused practice events: `PracticeSpecialtiesUpdated`, `PracticeContactInfoUpdated`, `PracticeMemberRoleChanged`, `PracticeMemberRemoved`, `PracticeMemberLeft` — remove from definitions file and barrel export
- [ ] Verify all `if (!user)` checks are gone (should be 0 after Group A)
- [ ] Fix `requireAdmin` TODO in `src/shared/middleware/requireAuth.ts:82`
- [ ] Audit `getFullOrganization` calls used only for auth → replace with CASL
- [ ] Delete any remaining dead code from old authorization approach

---

### PR-16 — Hono Response Typing Cleanup

**Dependencies:** All Group A merged

- [ ] Migrate handlers from `response.fromResult(...)`/`response.ok(...)` to direct `c.json(...)`/`c.body(...)` returns
- [ ] Keep only payload-builder utilities (if needed), avoid response wrappers that return `any`
- [ ] Remove temporary Oxlint rule overrides added for `no-unsafe-return`/unsafe assertions after migration
- [ ] Update handler pattern examples in this plan to reflect direct Hono responses

---

## Group C — Infrastructure

> Independent of Groups A and B — can be started at any time.

---

### PR-14 — Env Config Centralization

**Dependencies:** None

- [ ] Create `src/shared/config/index.ts` — Zod schema, validate at startup
- [ ] Replace all `process.env` reads across 24 files with typed config imports
- [ ] Harden async event dispatch: replace fire-and-forget `setImmediate`, add dead-letter retry

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

| File | Lines | Target PR |
|------|-------|-----------|
| `uploads.service.ts` | **633** | PR-5 |
| `user-details.service.ts` | **543** | PR-4 |
| `practice.service.ts` | **507** | PR-2 |
| `stripe-customer.service.ts` | **417** | PR-8 |
| `matters.service.ts` | **410** | Acceptable |
| `practice-details.service.ts` | **369** | PR-2 |
| `matter-milestones.service.ts` | **368** | Acceptable |
| `invoice-webhooks.service.ts` | **348** | Post PR-1 |
| `subscription.service.ts` | **341** | PR-6 |
| `matter-time-entries.service.ts` | **311** | Acceptable |
| `matter-expenses.service.ts` | **284** | Acceptable |
| `meteredProducts.service.ts` | **259** | PR-6 |
| `invoice-stripe-coordination.service.ts` | **247** | Post PR-1 |
| `trust.service.ts` | **240** | PR-9 |

### God Route Files (>300 lines)

| File | Lines | Target PR |
|------|-------|-----------|
| `practice.routes.ts` | **869** | PR-2 |
| `uploads.routes.ts` | **405** | PR-5 |

---

## Metrics

| Metric | Before | Now | Target |
|--------|--------|-----|--------|
| Modules using `ServiceContext` | 2 | **4** (matters, preferences, invoices, user-details) | all |
| Modules using CASL | 2 | **4** | all authenticated |
| Service files >200 lines | 9 | **~13** | **0** |
| Route files >300 lines | 3 | **3** | **0** |
| `if (!user)` checks | ~50 | **0** | **0** |
| `computeRoutingClaims` usages | ~15 | **0** | **0** |
| `requestHeaders` params | ~20 | **~5** | **0** |
| Direct `process.env` reads | 70 files | **24 files** | **0** |
| `any` type usages | 23 files | **5 files** | **0** |
| `as` type assertions | many | many | **0** |
