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

  if (data.related_id) {
    const related = await relatedRepository.findById(data.related_id);
    if (!related || related.organization_id !== ctx.organizationId) {
      return result.badRequest('Invalid related_id');
    }
  }

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

### Module Structure

```
module-name/
  ├── database/
  │   ├── queries/        # Repository functions (DB access only)
  │   └── schema/         # Drizzle table definitions
  ├── services/           # Business logic (one file per domain concept)
  ├── types/              # TypeScript types for this module
  ├── handlers.ts         # Request handlers (thin, just wiring)
  ├── routes.ts           # OpenAPI route definitions (or routes/ if >300 lines)
  └── http.ts             # Hono app with middleware wiring
```

### http.ts Pattern

```typescript
import * as handlers from './handlers';
import * as routes from './routes';

const app = createHonoApp();

app.use('*', injectAbility());

app.openapi(routes.createThingRoute, handlers.createThingHandler);

registerOpenApiRoutes(app, routes);
export default app;
```

---

## Progress Tracker

### Foundation (Complete)

- [x] CASL ability definitions — `src/shared/auth/abilities.ts`
- [x] `injectAbility` middleware — `src/shared/middleware/inject-ability.ts`
- [x] `OrgRole` enum + role groups — `src/shared/enums/org-roles.ts`
- [x] `ServiceContext` type + `getServiceContext` — `src/shared/types/service-context.ts`
- [x] `ctx.emit()` helper in ServiceContext — `src/shared/types/service-context.ts`
- [x] `routeBuilder.build()` with auto error schemas — `src/shared/router/route-builder.ts`
- [x] Global `ForbiddenError` handler — `src/shared/middleware/errorHandler.ts`
- [x] `toSubject()` type-safe helper — `src/shared/auth/subject-helpers.ts`
- [x] Hono `Variables` updated (ability, memberRole) — `src/shared/types/hono.ts`
- [x] `matterId` added to `ServiceContext` — `src/shared/types/service-context.ts`

### P0 — Matters Module (Gold Standard — Complete)

- [x] **1a.** Sub-services migrated to `ServiceContext` + CASL
- [x] **1b.** All functions use params objects + `ctx`
- [x] **1c.** Handlers are thin, use `getServiceContext(c)`
- [x] **1d.** Routes split into `routes/` directory (7 files, all <300 lines)
- [x] **1e.** `matter-tasks` removed (unused)

**Remaining matters cleanup** (non-blocking, nice-to-have):
- [ ] `matters.service.ts` (410 lines) — could split but acceptable for core CRUD
- [ ] `matter-milestones.service.ts` (368 lines) — could split
- [ ] `matter-time-entries.service.ts` (311 lines) — could split
- [ ] `matter-expenses.service.ts` (284 lines) — could split

### P1 — Standardize Every Module (The Real Work)

Each module gets the same treatment: adopt ServiceContext, params objects, CASL, thin handlers, split god services. One module at a time.

**Priority order** (by messiness + business importance):

- [x] **1. Invoices** — Complete
  - [x] Wire `injectAbility()` in `http.ts`
  - [x] Rewrite handlers to use `getServiceContext(c)` — all 7 handlers are thin (81 lines total)
  - [x] Split `invoices.service.ts` (562 lines) → 4 focused services:
    - `invoice-creation.service.ts` (183 lines)
    - `invoice-lifecycle.service.ts` (183 lines)
    - `invoice-queries.service.ts` (82 lines)
    - `invoice-stripe-coordination.service.ts` (247 lines)
  - [x] Add CASL checks in creation, lifecycle, queries, stripe-coordination services
  - [x] Convert all service functions to `({ data }, ctx)` pattern
  - [x] Remove `computeRoutingClaims` usage
  - [x] Remove refund-requests (handlers, routes, service, schema, queries)
  - [x] Remove `listeners.ts`
  - [x] Routes reduced to 149 lines (under 300)
  - **Remaining invoice cleanup** (non-blocking):
    - [ ] `invoice-webhooks.service.ts` (348 lines) — webhook handler, may not need ServiceContext
    - [ ] `invoice-stripe-coordination.service.ts` (247 lines) — slightly over 200
    - [ ] `stripe-invoices.service.ts` (209 lines) — slightly over 200
    - [ ] `fund-router.service.ts` (159 lines) — OK

- [ ] **2. Practice** — 5 services with inconsistent patterns, 869-line routes file
  - [ ] Wire `injectAbility()` in `http.ts`
  - [ ] Rewrite handlers to use `getServiceContext(c)` (currently: `c.get('user')!` + positional args)
  - [ ] Convert all service functions from `(orgId, user, headers)` → `(params, ctx)`
  - [ ] Add CASL checks in every service method
  - [ ] Split `practice.routes.ts` (869 lines) → `organization.routes.ts`, `members.routes.ts`, `practice-details.routes.ts`
  - [ ] Remove `requestHeaders` params where possible
    - **Note:** `members.service.ts` and `invitations.service.ts` are Better Auth integration wrappers — they need `requestHeaders` because `betterAuth.api.*` requires session headers. Pass headers via `ctx.headers` or keep as explicit param, but still standardize to `(params, ctx)` for everything else.
  - [ ] Remove `if (!user)` checks
  - [ ] `practice.service.ts` (507 lines) — split into focused sub-services
  - [ ] `practice-details.service.ts` (369 lines) — split or trim
  - [ ] **Event definitions cleanup** (`src/shared/events/definitions/practice.ts`):
    - [ ] Add typed payloads to `PracticeMemberInvited` and `PracticeMemberJoined` (currently `Record<string, unknown>`, actively dispatched)
    - [ ] Simplify `PracticeDetailsUpsertedPayload` — use `?` for optional + `| null` for nullable, not both `| null | undefined`

- [ ] **3. Practice-Client-Intakes** — worst god service (935 lines), deeply nested, mixed responsibilities
  - [ ] Split `practice-client-intakes.service.ts` (935 lines) → `intake-creation.service.ts`, `intake-checkout.service.ts`, `intake-lifecycle.service.ts`
  - [ ] Extract Stripe logic into dedicated helpers (not mixed with DB + validation)
  - [ ] Flatten nested code (4+ levels) into early-return + helper functions
  - [ ] Wire `injectAbility()`, adopt `getServiceContext(c)`
  - [ ] Convert to `(params, ctx)` pattern
  - [ ] Add CASL ownership checks
  - [ ] Split `practice-client-intakes.routes.ts` (542 lines) into logical groups
  - [ ] Remove `requestHeaders` params

- [ ] **4. User-Details** — 543-line service, raw positional args, mixed DB + Stripe + auth
  - [ ] Wire `injectAbility()` in `http.ts`
  - [ ] Rewrite handlers to use `getServiceContext(c)` (currently: manual `organizationId` extraction)
  - [ ] Convert service from `(orgId, data, actorId)` → `({ data }, ctx)`
  - [ ] Split `user-details.service.ts` (543 lines) → `user-details-crud.service.ts`, `user-details-stripe.service.ts`
  - [ ] Add CASL ownership checks
  - [ ] Remove remaining `if (!user)` checks

- [ ] **5. Uploads** — 633-line service, throws errors instead of Result pattern, mixed storage logic
  - [ ] Wire `injectAbility()` in `http.ts`
  - [ ] Convert to `(params, ctx)` pattern
  - [ ] **Fix error handling**: replace all `throw new Error()` with `return result.badRequest()`/`result.fail()`
  - [ ] Split `uploads.service.ts` (633 lines) → `upload-presign.service.ts`, `upload-confirm.service.ts`, `upload-queries.service.ts`
  - [ ] Extract storage provider logic (R2 vs Images) into `storage-provider.service.ts`
  - [ ] Add CASL per-resource permission checks
  - [ ] Split `uploads.routes.ts` (405 lines) into logical groups

- [ ] **6. Subscriptions** — clean-ish but no ServiceContext, heavy try/catch
  - [ ] Wire `injectAbility()` in `http.ts`
  - [ ] Adopt `getServiceContext(c)` in handlers
  - [ ] Convert services to `(params, ctx)` pattern
  - [ ] `subscription.service.ts` (341 lines) — split or trim
  - [ ] `meteredProducts.service.ts` (259 lines) — slightly over 200
  - [ ] Replace try/catch blocks with direct Result returns where possible
  - [ ] Add CASL checks (admin-only for management)
  - [ ] Remove `requestHeaders` params

- [ ] **7. Onboarding** — different file naming, decent logic
  - [ ] Rename `http.handlers.ts` → `handlers.ts` (match standard)
  - [ ] Wire `injectAbility()` in `http.ts`
  - [ ] Adopt `getServiceContext(c)` + `(params, ctx)` pattern
  - [ ] Add CASL checks (admin-only)
  - [ ] Remove `requestHeaders` params

- [ ] **8. Stripe Customers** — new module at `src/modules/stripe/customers/`
  - [ ] `stripe-customer.service.ts` (417 lines) — split into DB queries vs Stripe API
  - [ ] Adopt `(params, ctx)` pattern if not already
  - [ ] Remove `if (!user)` checks

- [ ] **9. Trust** — smaller module (240-line service), restored from staging
  - [ ] Wire `injectAbility()` in `http.ts`
  - [ ] Adopt `getServiceContext(c)` + `(params, ctx)` pattern
  - [ ] Add CASL checks (admin manage, member read)

- [ ] **10. Remaining** (webhooks, stripe listeners, public, dev)
  - [ ] Review if CASL applies (system-initiated modules may not need it)
  - [ ] Ensure consistent structure where applicable
  - [ ] Dev module already trimmed (554 → 83 lines)

### P2 — Expand CASL Rules

Once modules are standardized, add fine-grained permissions:

- [ ] Add `Invoice` subject — admin: manage, member: read, client: read own
- [ ] Add `Subscription` subject — admin: manage, member: read
- [ ] Add `Upload` subject — admin: manage, member: create+read, client: read own
- [ ] Add `UserDetails` subject — admin: manage, member: read own, client: read own
- [ ] Add `Onboarding` subject — admin: manage
- [ ] Add `Trust` subject — admin: manage, member: read

### P2.5 — Eliminate `as` Type Assertions with Generics

Replace unsafe `as` casts with proper generics throughout the codebase — like how `axios.get<Invoice>()` returns typed results without casting.

**A. Services: Use `result.ok<T>()` with explicit type param**
```typescript
// Before (unsafe cast)
return result.ok({ ...matter, assignees: ... } as MatterRecord);

// After (generic, compiler-validated)
return result.ok<MatterRecord>({ ...matter, assignees: ... });
```
- [ ] Matters services — 4 `as MatterRecord` casts
- [ ] Invoice services — any remaining `as` casts
- [ ] All other services — audit and fix during module migration

**B. Repository queries: Add explicit return types**
```typescript
// Before (inferred, callers must cast)
const findMatterByIdWithRelations = async (id: string, tx?: typeof db) => { ... };

// After (explicit, no cast needed downstream)
const findMatterByIdWithRelations = async (id: string, tx?: typeof db): Promise<MatterWithRelations | undefined> => { ... };
```
- [ ] Define `WithRelations` types per module (e.g. `MatterWithRelations`)
- [ ] Add explicit return types to all relational queries

**C. JSON columns: Use Drizzle's `.$type<T>()` on schema**
```typescript
// Before (returns unknown, forces cast)
notifications: jsonb('notifications'),

// After (typed at schema level)
notifications: jsonb('notifications').$type<NotificationPreferences>(),
```
- [ ] Preferences schema — `notifications`, `onboarding`, `display` columns
- [ ] Any other JSON columns across modules

**D. Stripe webhook handlers: Type-narrow instead of cast**
```typescript
// Before
const product = event.data.object as Stripe.Product;

// After (type guard)
if (event.type === 'product.created') {
  const product = event.data.object; // already narrowed by Stripe SDK
}
```
- [ ] Audit webhook handlers in subscriptions and invoices

### P3 — Final Cleanup

- [x] ~~Delete `src/shared/auth/services/routing.service.ts` (old auth)~~ — DONE
- [x] ~~Remove all `computeRoutingClaims` imports and usages~~ — DONE (0 remaining)
- [ ] Remove remaining `if (!user)` checks (2 left: `user-details.service.ts`, `customers.repository.ts`)
- [ ] Fix `requireAdmin` TODO in `src/shared/middleware/requireAuth.ts:82`
- [ ] Audit `getFullOrganization` calls used only for auth → replace with CASL
- [ ] Delete dead code from old authorization approach
- [ ] Delete 5 unused practice events: `PracticeSpecialtiesUpdated`, `PracticeContactInfoUpdated`, `PracticeMemberRoleChanged`, `PracticeMemberRemoved`, `PracticeMemberLeft` + remove from barrel export

### P4 — Hardening & Config

- [ ] Centralize env config: `src/shared/config/index.ts` with Zod schema, validate at startup, replace `process.env` reads (currently 24 files)
- [ ] Harden async event dispatch: replace `setImmediate` fire-and-forget, add dead-letter retry

### P5 — Backlog

- [ ] Tighten TypeScript config (`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`)
- [ ] Clean up remaining `any` type usages (currently 6 files)
- [ ] Remove unused `HandlerOptions` fields in event types
- [ ] Fix relative imports in all event definition files (`../event` → `@/shared/events/event`)
- [ ] Standardize codegen workflow (`pnpm codegen` + pre-commit hook)
- [ ] Consolidate schema locations (4 places → 2)

---

## Module Migration Checklist

Copy for each module:

```
### Module: [name]

**Standardize handlers:**
- [ ] Rewrite all handlers to use `getServiceContext(c)`
- [ ] Remove all `if (!user)` checks
- [ ] Remove all manual `c.get('user')` / `c.get('userId')` / headers extraction
- [ ] Ensure every handler is 3-8 lines (no business logic)

**Standardize services:**
- [ ] Convert all functions to `(params, ctx: ServiceContext)` — max 2 args
- [ ] Add `ForbiddenError.from(ctx.ability).throwUnlessCan(...)` as first line
- [ ] Return `Result<T>` from every function — no `throw` for expected failures
- [ ] Remove all `requestHeaders` parameters
- [ ] Split any service file >200 lines into focused sub-services
- [ ] Split any function >50 lines into smaller functions

**Standardize routes:**
- [ ] Migrate to `routeBuilder.build()` (auto error schemas)
- [ ] Split any routes file >300 lines

**Standardize http.ts:**
- [ ] Wire `injectAbility()` middleware
- [ ] Use consistent import style
- [ ] Use `registerOpenApiRoutes(app, routes)`

**Verify:**
- [ ] `npx tsc --noEmit` compiles clean
- [ ] Every handler uses `getServiceContext(c)`
- [ ] Every service function has max 2 params: `(params, ctx)`
- [ ] No file >200 lines in services/
- [ ] No function >50 lines
```

---

## Current State (What's Still Wrong)

### God Services (>200 lines — target <200)

| File | Lines | Status |
|------|-------|--------|
| `practice-client-intakes.service.ts` | **935** | NEEDS SPLIT |
| `uploads.service.ts` | **633** | NEEDS SPLIT |
| `user-details.service.ts` | **543** | NEEDS SPLIT |
| `practice.service.ts` | **507** | NEEDS SPLIT |
| `stripe-customer.service.ts` | **417** | NEEDS SPLIT |
| `matters.service.ts` | **410** | Acceptable (core CRUD) |
| `practice-details.service.ts` | **369** | NEEDS SPLIT |
| `matter-milestones.service.ts` | **368** | Acceptable |
| `invoice-webhooks.service.ts` | **348** | Webhook handler — review |
| `subscription.service.ts` | **341** | NEEDS SPLIT |
| `matter-time-entries.service.ts` | **311** | Acceptable |
| `matter-expenses.service.ts` | **284** | Acceptable |
| `meteredProducts.service.ts` | **259** | Slightly over |
| `invoice-stripe-coordination.service.ts` | **247** | Slightly over |
| `trust.service.ts` | **240** | Slightly over |

### God Route Files (>300 lines — target <300)

| File | Lines | Status |
|------|-------|--------|
| `practice.routes.ts` | **869** | NEEDS SPLIT |
| `practice-client-intakes.routes.ts` | **542** | NEEDS SPLIT |
| `uploads.routes.ts` | **405** | NEEDS SPLIT |

### Inconsistent Handler Patterns

| Module | Pattern | Status |
|--------|---------|--------|
| **matters** | `getServiceContext(c)` + params objects | CLEAN |
| **preferences** | `getServiceContext(c)` + ctx only | CLEAN |
| **invoices** | `getServiceContext(c)` + params objects | CLEAN |
| **practice** | `c.get('user')!` + 3 positional args + headers | NEEDS FIX |
| **user-details** | Manual param mapping + `organizationId` extraction | NEEDS FIX |
| **subscriptions** | No context at all in some methods | NEEDS FIX |
| **onboarding** | `c.get('user')!` + positional args + headers | NEEDS FIX |
| **uploads** | Mixed, throws errors | NEEDS FIX |
| **practice-client-intakes** | Mixed public/private, inconsistent | NEEDS FIX |
| **trust** | Manual pattern, no ServiceContext | NEEDS FIX |

### Functions With Too Many Parameters

```
practice/services:
  updatePracticeMemberRole(orgId, memberId, role, user, headers) → should be ({ memberId, role }, ctx)
  createPracticeInvitation(orgId, email, role, user, headers)    → should be ({ email, role }, ctx)
  upsertPracticeDetails(orgId, data, user, headers)              → should be ({ data }, ctx)

user-details.service.ts:
  createUserDetails(orgId, data, actorId) → should be ({ data }, ctx)

practice-client-intakes.service.ts:
  Various functions with (orgId, data, user, headers) patterns
```

---

## Rollout Timeline

| Phase | What | Status |
|-------|------|--------|
| **Foundation** | CASL, ServiceContext, routeBuilder, errorHandler | Complete |
| **P0** | Matters module as gold standard | Complete |
| **P1.1** | Invoices module standardized | **Complete** |
| **P1.2-10** | Standardize remaining modules (practice → PCI → user-details → uploads → subs → onboarding → stripe → trust → remaining) | **Next** |
| **P2** | Expand CASL rules for all subjects | After P1 |
| **P2.5** | Eliminate `as` casts with generics (`result.ok<T>()`, typed queries, `.$type<T>()`) | After P2 |
| **P3** | Remove old auth patterns | **Partially done** (routing.service + computeRoutingClaims removed) |
| **P4** | Env config, event hardening | After P3 |
| **P5** | Backlog (tsconfig, any types, codegen) | When time permits |

---

## Metrics

| Metric | Before | Now | Target |
|--------|--------|-----|--------|
| Modules using `ServiceContext` | 2 | **3** (matters, preferences, invoices) | **all** |
| Modules using CASL | 2 | **3** | **all authenticated** |
| Service files >200 lines | 9 | **~14** (some new splits still large) | **0** |
| Route files >300 lines | 3 | **3** (practice, PCI, uploads) | **0** |
| Functions >50 lines | many | fewer | **0** |
| Functions with >2 params | many | fewer | **0** |
| `if (!user)` checks | ~50 | **~2** | **0** |
| `computeRoutingClaims` usages | ~15 | **0** | **0** |
| `requestHeaders` params | ~20 | **~10** (practice, subs, PCI, onboarding) | **0** |
| Direct `process.env` reads | 70 files | **24 files** | **0** |
| `any` type usages | 23 files | **6 files** | **0** |
| `as` type assertions | many | many | **0** (use generics) |
