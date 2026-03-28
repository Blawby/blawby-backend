# Tech Debt Remediation Plan

> **Goal:** Make the codebase readable, standardized, and easy for any new developer to understand.
> **Branch:** `refactor/tech-debt`
> Testing infrastructure is tracked on a separate branch — excluded from this plan.

⚠️ **METRICS AUDIT (2026-03-28):** Plan metrics were significantly understated. God services were **initially 20 files >200 lines**, now **18 files >200 lines** after PR-4 split and follow-up review. Several PRs previously marked "closed" still contain unfinished service files, so Group A completion is ~50-60% (not 85%). See [Branch Status Snapshot](#branch-status-snapshot-2026-03-28--metrics-audit-completed) below.

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
  return sendResult(c, result, 201);
};
```

**Rules:**

- Always use `getServiceContext(c)` — never extract `user`, `orgId`, `headers` manually
- Never write `if (!user) return response.unauthorized(c)` — middleware handles auth
- Pass params as an object + `ctx` — never positional args
- Handlers should be 3-8 lines, no business logic
- Handler response should go through `sendResult(...)` for consistency

### Service Pattern

```typescript
// thing.service.ts — business logic, max ~200 lines per file
// Returns Result<T> for success/failure
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
- Return `Result<T>` — do not return raw HTTP responses from services
- Convert expected failures to `result.*` helpers and map to handler responses via `sendResult`
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

### Branch Status Snapshot (2026-03-28) — METRICS AUDIT COMPLETED

**Verified completed on current branch (baseline):**

- [x] `injectAbility()` wired in **all 14 modules** (dev, public, webhooks, and 11 others)
- [x] `src/modules/onboarding/http.handlers.ts` renamed to `src/modules/onboarding/handlers.ts`
- [x] Most handlers use `getServiceContext(c)` + thin pattern (PR-6 still has open service-contract work)
- [x] `sendResult(...)` is the default handler utility (PR-16 tracks final normalization)
- [x] `pnpm run typecheck` currently passes

**CRITICAL ISSUE: Service file sizes are 54% worse than tracked**

- ❌ **Plan claimed ~13 god services, actual: 20 god services**
- ✅ **PR-4 historical issue resolved:** `clients-crud.service.ts` was 559 lines and was later split; PR-4 is merged with 9 focused services
- ❌ **PR-7 (Onboarding) marked "closed" but `onboarding-webhooks.service.ts` is 372 lines** (violates 200-line limit)
- ❌ **PR-3 (Practice-Client-Intakes) marked mostly done but has 3 files >300 lines** (intake-lifecycle: 380, intake-checkout: 343, intake-creation: 296)
- ⚠️ **PR-2 (Practice) split but `matter-milestones.service.ts` grew to 416 lines** (was 368 estimated)

**Remaining high-priority work:**

- [ ] **Split god services** (18 files >200 lines (14 need re-work, 4 acceptable))
- [x] `clients-crud.service.ts` split complete; remaining `if (!user)` checks in `clients-intake-creation.service.ts` are intentional and valid
- [ ] Remove remaining `requestHeaders` usage:
  - `src/modules/subscriptions/services/subscription.service.ts` (2 occurrences, lines 282, 338)
  - `src/modules/practice/services/organization.service.ts` (5 occurrences, lines 49, 89, 109, 133, 157)
- [ ] Remove legacy `src/modules/uploads/services/uploads.service.ts` (actively used by 8 handlers)

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

### ⚠️ PR-3 — Practice-Client-Intakes Module

**Files:** `src/modules/practice-client-intakes/`

**⚠️ ISSUE:** Services are oversized (violates 200-line limit):

- `intake-lifecycle.service.ts`: **380 lines**
- `intake-checkout.service.ts`: **343 lines**
- `intake-creation.service.ts`: **296 lines**

- [x] Fully replace legacy `practice-client-intakes.service.ts`
  - [x] Extract route-facing services: `intake-creation.service.ts`, `intake-checkout.service.ts`, `intake-lifecycle.service.ts`
  - [x] Extract shared helpers: `intake-access.helpers.ts`, `intake-shared.helpers.ts`
  - [x] Move core DB + Stripe orchestration out of the legacy service into the extracted services/helpers
- [ ] Extract Stripe logic into dedicated helpers (not mixed with DB + validation)
- [ ] Flatten nested code (4+ levels deep) into early-return + helper functions
- [ ] **Split oversized services:** intake-lifecycle (380→<200), intake-checkout (343→<200), intake-creation (296→<200)
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

### ✅ PR-4 — User-Details Module

**Files:** `src/modules/clients/` (migrated scope)

- [x] Wire `injectAbility()` in `http.ts`
- [x] Rewrite handlers to use `getServiceContext(c)`
- [x] Convert service from `(orgId, data, actorId)` → `({ data }, ctx)`
- [x] Split `clients-crud.service.ts` (559 lines) → 9 focused services (all <200 lines):
  - [x] `clients-direct-creation.service.ts` (96 lines) — `createClient`
  - [x] `clients-intake-creation.service.ts` (119 lines) — `createClientFromIntake`
  - [x] `clients-mutation.service.ts` (171 lines) — `updateClient`, `deleteClient` ← largest
  - [x] `clients-queries.service.ts` (72 lines) — `listClients`, `getClient`
  - [x] `clients-stripe.service.ts` (79 lines) — Stripe operations
  - [x] `clients-setup.service.ts` (68 lines) — Setup operations
  - [x] `client-memos.service.ts` (129 lines) — Memo operations
  - [x] `clients-utils.ts` (68 lines) — Shared utilities
  - [x] `clients-creation.helpers.ts` (27 lines) — Creation helpers
- [x] Add CASL ownership checks
- [ ] Review `if (!user)` checks in clients-intake-creation.service.ts (lines 21, 48) — _valid DB lookups, can remain_
- [x] Extract `resolveUserForIntake` to `clients-utils.ts`

**Status:** ✅ CLOSED — Proper split into 9 services. All files <200 lines. CASL checks added. Ready for merge.

---

### PR-5 — Uploads Module

**Files:** `src/modules/uploads/`

- [x] Wire `injectAbility()` in `http.ts`
- [x] **Fix error handling in uploads services**: remove direct `throw new Error()` usage in `src/modules/uploads/services/*.ts`
- [ ] Finalize migration and delete legacy `uploads.service.ts` (still present)
- [x] Extract storage provider logic (R2 vs Images) into `storage-provider.service.ts`
- [x] Add CASL per-resource permission checks
- [x] Split `uploads.routes.ts` (405 lines) into logical groups

---

### PR-6 — Subscriptions Module

**Files:** `src/modules/subscriptions/`

- [ ] Wire `injectAbility()`, adopt `getServiceContext(c)`, convert to `(params, ctx)`
- [ ] Split `subscription.service.ts` (359 lines), trim `meteredProducts.service.ts` (259 lines)
- [ ] Replace try/catch blocks with direct Result returns where possible
- [ ] Add CASL checks (admin-only for management)
- [ ] Remove `requestHeaders` params

---

### ⚠️ PR-7 — Onboarding Module

**Files:** `src/modules/onboarding/`

**⚠️ ISSUE:** Services are oversized:

- `onboarding-webhooks.service.ts`: **372 lines**
- `connected-accounts.service.ts`: **356 lines**

- [x] Rename `http.handlers.ts` → `handlers.ts`
- [x] Wire `injectAbility()`, adopt `getServiceContext(c)` + `(params, ctx)`
- [x] Add CASL checks (admin-only)
- [x] Remove `requestHeaders` params
- [ ] **Split oversized services:** onboarding-webhooks (372→<200), connected-accounts (356→<200)

**Status:** ❌ NOT CLOSED — Webhook and account services exceed 200-line limit. Needs re-work before closure.

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

**A. Services: Use `result.ok<T>()`**

```typescript
// Before: return result.ok({ ...matter, assignees } as MatterRecord);
// After:  return result.ok<MatterRecord>({ ...matter, assignees });
```text

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

- [x] Delete 5 unused practice events: `PracticeSpecialtiesUpdated`, `PracticeContactInfoUpdated`, `PracticeMemberRoleChanged`, `PracticeMemberRemoved`, `PracticeMemberLeft` — remove from definitions file and barrel export
- [ ] Verify all `if (!user)` checks are gone (should be 0 after Group A)
- [x] Fix `requireAdmin` TODO in `src/shared/middleware/requireAuth.ts:82`
- [x] Audit `getFullOrganization` calls used only for auth → replace with CASL
- [ ] Delete any remaining dead code from old authorization approach

---

### PR-16 — Response Utility Consistency Cleanup

**Dependencies:** All Group A merged

- [ ] Standardize on one handler response utility (`sendResult` preferred) and remove mixed usage of `response.fromResult(...)`
- [ ] Keep payload-builder utilities (if needed), avoid response wrappers that return `any`
- [ ] Remove temporary Oxlint rule overrides added for `no-unsafe-return`/unsafe assertions after migration
- [ ] Update handler pattern examples in this plan to reflect `sendResult(...)` consistently

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

⚠️ **STALLED:** Group A is ~50-60% done (not 85%). Group B **cannot start** until PR-3 and PR-7 are re-worked.

```
✅ Foundation  →  ✅ PR-0 Matters  →  ✅ PR-1 Invoices
                                              │
         ┌────────────────────────────────────┘
         │
         │  Group A  (INCOMPLETE — needs re-work)
         ├─ ✅ PR-2   Practice                (mostly done)
         ├─ ⚠️ PR-3   Practice-Client-Intakes (3 oversized services)
         ├─ ✅ PR-4   User-Details            (DONE - 9 services <200 lines) ← PR-4 MERGED
         ├─ ✅ PR-5   Uploads                 (mostly done)
         ├─ 🚧 PR-6   Subscriptions           (in progress)
         ├─ ❌ PR-7   Onboarding              (2 oversized services)
         ├─ ❌ PR-8   Stripe Customers        (not started)
         ├─ ⚠️ PR-9   Trust                   (trust.service: 390 lines)
         └─ ✅ PR-10  Remaining               (done)
                   │
                   │  ⛔ BLOCKED: Group A not finished
                   │  Need to split 14+ god services first
                   │
         ┌─────────┴──────────────────┐
         │  Group B  (blocked)        │
         ├─ PR-11  CASL Expansion     │
         ├─ PR-12  Type Safety Sweep  │
         └─ PR-13  Dead Code Cleanup  │
                   │                  │
                   └────────┬─────────┘
                            │
                        PR-15 TSConfig

PR-14 (Env Config) ── ✅ already merged
```

---

## Size Reference

### God Services (>200 lines)

**✅ UPDATED 2026-03-28: 18 files found (was 20, clients-crud ✅ split).**

| File                                     | Lines   | Target PR   | Status                                 |
| ---------------------------------------- | ------- | ----------- | -------------------------------------- |
| `matters.service.ts`                     | **538** | Acceptable  | Over estimate (was 410)                |
| `invoice-webhooks.service.ts`            | **450** | Post PR-1   | Over estimate (was 348)                |
| `matter-milestones.service.ts`           | **416** | Acceptable  | Over estimate (was 368)                |
| `trust.service.ts`                       | **390** | PR-9        | Over estimate (was 240)                |
| `intake-lifecycle.service.ts`            | **380** | PR-3        | ❌ PR-3 not fully complete             |
| `onboarding-webhooks.service.ts`         | **372** | PR-7        | ❌ PR-7 marked "closed" but unfinished |
| `matter-time-entries.service.ts`         | **372** | Acceptable  | Over estimate (was 311)                |
| `subscription.service.ts`                | **359** | PR-6        | Needs split                            |
| `connected-accounts.service.ts`          | **356** | PR-7        | Not tracked in original plan           |
| `intake-checkout.service.ts`             | **343** | PR-3        | Not tracked in original plan           |
| `invoice-stripe-coordination.service.ts` | **311** | Post PR-1   | Over estimate (was 247)                |
| `matter-expenses.service.ts`             | **299** | Acceptable  | Over estimate (was 284)                |
| `intake-creation.service.ts`             | **296** | PR-3        | Not tracked in original plan           |
| `invoice-creation.service.ts`            | **247** | Not tracked | Not in original plan                   |
| `matter-notes.service.ts`                | **246** | Not tracked | Not in original plan                   |
| `stripe-invoices.service.ts`             | **226** | Post PR-1   | Over estimate (was 209)                |
| `practice-management.service.ts`         | **219** | PR-2        | Over estimate (from 507 split)         |
| `invoice-queries.service.ts`             | **217** | Not tracked | Not in original plan                   |

### God Route Files (>300 lines)

| File                 | Lines   | Target PR |
| -------------------- | ------- | --------- |
| `practice.routes.ts` | **869** | PR-2      |
| `uploads.routes.ts`  | **405** | PR-5      |

---

## Metrics

| Metric                         | Before   | Now (verified 2026-03-28)                           | Target   |
| ------------------------------ | -------- | --------------------------------------------------- | -------- |
| Modules using `ServiceContext` | 2        | **14** (all modules)                                | all ✅   |
| Modules using CASL             | 2        | **14** (all modules with injectAbility())           | all ✅   |
| Service files >200 lines       | 9        | **18** (was 20, PR-4 ✅ split)                      | **0** ❌ |
| Route files >300 lines         | 3        | **2** (`practice.routes.ts`, `uploads.routes.ts` split needed) | **0** ❌ |
| `if (!user)` checks            | ~50      | **2** (intentional checks remain in intake-driven client creation) | **0** ⚠️ |
| `computeRoutingClaims` usages  | ~15      | **0**                                               | **0** ✅ |
| `requestHeaders` params        | ~20      | **7** (verified: 2 in subscriptions, 5 in practice) | **0** ❌ |
| Direct `process.env` reads     | 70 files | **24 files** (via config centralization)            | **0** ✅ |
| `any` type usages              | 23 files | **5 files**                                         | **0** ❌ |
| `as` type assertions           | many     | many (type safety sweep not started)                | **0** ❌ |

*Footnote: intentional `if (!user)` checks currently remain in `src/modules/clients/services/clients-intake-creation.service.ts` as guarded lookup validations.*
