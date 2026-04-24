# Codebase Inconsistencies Audit

> Living checklist. Update status as items are resolved. Audited 2026-04-24.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fixed |
| 🔄 | In progress (current PR) |
| ⬜ | Not started |

---

## 1. Error Handling — Two Incompatible Patterns

**Severity:** High  
**Status:** ⬜

**Problem:** Half the codebase uses the old `Result<T>` / `sendResult` pattern; the other half uses throw-based `HTTPException`. CLAUDE.md mandates throw-based only.

**Modules still using `Result<T>`:**
- `matters/` — service returns `Result<T>`, handlers call `sendResult(c, result)`
- `matters/services/matters.service.ts` — wraps `ForbiddenError.throwUnlessCan()` in try/catch and converts to `Result<never>` (opposite of the rule)
- `trust/services/trust.service.ts` — custom `assertTrustManageAccess()` / `assertTrustReadAccess()` return `Result<void>` instead of throwing
- `trust/`, `subscriptions/`, `practice-client-intakes/`, `onboarding/`, `stripe/` handlers — all use `sendResult`
- Services returning `Result<{ success: true }>` for deletes — should return `Promise<void>` and throw on failure

**What correct looks like:**
```typescript
// service
const deleteThing = async (id: string, ctx: ServiceContext): Promise<void> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'Thing');
  const deleted = await db.delete(things).where(eq(things.id, id));
  if (!deleted) throw new HTTPException(404, { message: 'Not found' });
};

// handler
const deleteThingHandler = async (c) => {
  await thingService.deleteThing(id, ctx); // throws on error
  return c.body(null, 204);
};
```

**Related plan:** `2026-04-03-api-breaking-standardization.md` (Tasks 1c, 1d) partially addresses the handler side for deletes.

---

## 2. `engagement-contracts` Module Deviations

**Severity:** High  
**Status:** 🔄 (being fixed in current PR)

**Problems:**
- ~~Used raw `createRoute()` instead of `routeBuilder.build()`~~ ✅
- ~~No `practice_id` in route paths~~ ✅
- ~~Generic `{id}` param instead of `{contract_id}`~~ ✅
- ~~Exported handlers as `engagementContractHandlers` instead of `handlers`~~ ✅
- ~~Handler `{ id }` destructuring instead of `{ contract_id: id }`~~ ✅
- `practice_id` in URL is not validated against `ctx.organizationId` in service ⬜

**Remaining:** Add URL param validation in `engagement-contract.service.ts` — confirm `practice_id` from URL matches `ctx.organizationId` before proceeding, consistent with how other modules cross-check ownership.

---

## 3. Handler Export Style — Three Different Patterns

**Severity:** Medium  
**Status:** ⬜

**Problem:** No consistent convention for how handlers are exported across modules.

| Style | Modules |
|-------|---------|
| `export const handlers = { ... }` (bundled object) | `matters`, `invoices`, `trust`, `subscriptions`, `stripe`, `onboarding`, `practice-client-intakes`, `engagement-contracts` (after fix) |
| `export const fooHandler = ...` (individual named exports) | `clients`, `practice` |
| Mixed | `clients` (both named exports + bundled object) |

**Resolution:** Standardize to `export const handlers = { ... }` (bundled object) as used by the majority. `clients` and `practice` need to be migrated.

---

## 4. File and Directory Naming — Three Different Conventions

**Severity:** Medium  
**Status:** ⬜

### 4a. Validation/schema directory name

| Name | Modules |
|------|---------|
| `validations/` | `matters`, `clients`, `practice`, `engagement-contracts`, `onboarding`, `practice-client-intakes`, `subscriptions`, `worker-events`, `stripe` |
| `schemas/` | `invoices` |
| `schema/` | `preferences` |
| flat `types.ts` | `clients` |

**Resolution:** Rename `invoices/schemas/` → `invoices/validations/` and `preferences/schema/` → `preferences/validations/`.

### 4b. Query layer file suffix

| Suffix | Modules |
|--------|---------|
| `.queries.ts` | `matters`, `clients`, `trust`, `engagement-contracts` |
| `.repository.ts` | `practice`, `invoices` (partially), `onboarding`, `subscriptions`, `practice-client-intakes` |

**Resolution:** Standardize to `.queries.ts` (majority). Rename `.repository.ts` files to `.queries.ts`.

### 4c. Service file naming within `subscriptions/services/`

Mixed camelCase and kebab-case in the same directory:
- camelCase: `meteredProducts.service.ts`, `subscriptionWebhooks.service.ts`, `syncPlans.service.ts`
- kebab-case: `seat-metering.service.ts`, `subscription.service.ts`

**Resolution:** Rename camelCase files to kebab-case.

---

## 5. Misplaced Files

**Severity:** Medium  
**Status:** ⬜

### 5a. Handler files inside `services/`

- `src/modules/invoices/services/invoice-lifecycle.handlers.ts`
- `src/modules/invoices/services/invoice-metering.handlers.ts`

These are Graphile Worker task handlers, not service files. They should move to a `workers/` or `tasks/` subdirectory, or be co-located with the worker bootstrap.

### 5b. Sub-resource files in module root

- `src/modules/invoices/refund-requests.handlers.ts`
- `src/modules/invoices/refund-requests.routes.ts`

These belong in `invoices/routes/refund-requests.routes.ts` and folded into `invoices/handlers.ts` (or a `routes/` subdirectory), consistent with how matters organizes sub-resources.

---

## 6. Orphaned / Unregistered Event Files

**Severity:** Medium  
**Status:** ⬜

### 6a. `clients.ts` — not imported in `definitions.ts`

- File: `src/shared/events/definitions/clients.ts`
- Content: `UserDetailsCreated`, `UserDetailsUpdated`, `UserDetailsDeleted`, `UserDetailsStatusChanged` (not client events — likely a copy-paste/rename artifact)
- Not in `EventClasses` map
- **Action:** Determine if these events are needed. If yes, rename appropriately and register. If no, delete the file.

### 6b. `engagement-contracts.ts` — not imported in `definitions.ts`

- File: `src/shared/events/definitions/engagement-contracts.ts`
- Contains: `EngagementContractCreated`, `EngagementContractSent`, etc.
- Not imported in `definitions.ts` and not in `EventClasses` map
- **Action:** Import in `definitions.ts` and add to `EventClasses`.

### 6c. `practice.events.types.ts` — module-local event types

- File: `src/modules/practice/events/practice.events.types.ts`
- All other event classes live in `src/shared/events/definitions/`
- **Action:** Move content to `src/shared/events/definitions/practice.ts` (which already exists) and delete the module-local file.

---

## 7. Service Size Violations

**Severity:** Medium  
**Status:** ⬜

CLAUDE.md specifies ~200 lines per service file, ~50 lines per function. Current violations:

| File | Lines |
|------|-------|
| `invoices/services/refund-requests.service.ts` | 599 |
| `clients/services/clients-crud.service.ts` | 564 |
| `matters/services/matters.service.ts` | 556 |
| `engagement-contracts/services/engagement-contract.service.ts` | 460 |
| `subscriptions/services/subscription.service.ts` | 443 |
| `matters/services/matter-milestones.service.ts` | 416 |
| `practice-client-intakes/services/intake-lifecycle.service.ts` | 415 |
| `trust/services/trust.service.ts` | 391 |
| `webhooks/services/onboarding-webhooks.service.ts` | 372 |
| `matters/services/matter-time-entries.service.ts` | 372 |

**Note:** Size alone isn't the issue — splitting for the sake of splitting creates shallow modules. Only split when a file has multiple distinct responsibilities that can be cleanly separated.

---

## 8. `preferences` Handler — Breaks Multiple Handler Rules

**Severity:** Medium  
**Status:** ⬜

`src/modules/preferences/handlers.ts`:

- Uses `c.req.param('category')` (raw Hono) instead of `c.req.valid('param')` (OpenAPI-typed)
- Handlers are not typed as `AppRouteHandler<typeof route>`
- Contains validation logic inline: `isValidPreferenceCategory()`, `parseCategoryPayload()`
- Returns `{ error: '...' }` shape (non-standard) instead of throwing `HTTPException`
- Routes use `PUT /{category}` — should be `PATCH` (tracked in `api-breaking-standardization.md` Task 3e)

**Resolution:** Rewrite to use `AppRouteHandler<>` types, `c.req.valid('param')`, and throw `HTTPException` for invalid input.

---

## 9. Datetime Validation — Three Different Approaches

**Severity:** Low–Medium  
**Status:** ⬜

| Pattern | Where | Problem |
|---------|-------|---------|
| `z.date()` | `invoices/schemas/`, `preferences/`, `clients/` | Produces JS `Date` objects — not JSON-serializable as ISO strings |
| `z.iso.datetime({ offset: true })` | `invoices/refund-requests.routes.ts`, `trust/routes.ts` | Correct for API responses |
| `z.iso.datetime()` (no offset) | `clients/`, `worker-events/` | Missing timezone offset |

**Resolution:** Response schemas that serialize dates should use `z.iso.datetime({ offset: true })`. Input schemas (request bodies) should use `z.iso.datetime({ offset: true })`. `z.date()` should only appear in internal/DB types, not API schemas.

---

## 10. Direct `zod` Imports in Module Files

**Severity:** Low  
**Status:** ⬜

CLAUDE.md rule 3: always import `z` from `@hono/zod-openapi`. The following module files import from `'zod'` directly:

- `src/modules/preferences/schema/preferences.schema.ts`
- `src/modules/preferences/validations/preferences.validation.ts`
- `src/modules/onboarding/schemas/onboarding.schema.ts`
- `src/modules/practice-client-intakes/services/intake-stripe.helpers.ts` (type import only)
- `src/modules/subscriptions/types/subscription.types.ts` (type import only)
- `src/modules/practice/types/practice.types.ts` (type import only)

Type-only imports (`import type { z } from 'zod'`) are lower risk but still inconsistent. Value imports (`import { z } from 'zod'`) in schema files can cause Zod v3/v4 incompatibilities if `@hono/zod-openapi` ships a different version.

---

## 11. `trust` and `subscriptions` Emit Events with No Listeners

**Severity:** Low  
**Status:** ⬜

- `trust/services/trust.service.ts` calls `ctx.emit(...)` but `trust/` has no `listeners.ts`
- `subscriptions/` has no `listeners.ts` — no module listens to subscription events locally

These may be intentional (events handled by shared/global listeners), but worth verifying nothing is silently dropped.

---

## Already Tracked in Other Plans

The following are documented in `docs/superpowers/plans/` and not repeated here:

| Item | Plan file |
|------|-----------|
| DELETE endpoints → 204 | `2026-04-03-api-breaking-standardization.md` Tasks 1a–1d |
| List response envelopes → `{ data, pagination }` | `2026-04-03-api-breaking-standardization.md` Tasks 2a–2c |
| REST verb violations (`GET /list`, `POST /cancel`, etc.) | `2026-04-03-api-breaking-standardization.md` Task 3 |
| `PUT` → `PATCH` for partial updates | `2026-04-03-api-breaking-standardization.md` Task 3e |
| `{uuid}` → `{practice_id}` in practice routes | `2026-04-03-api-non-breaking-fixes.md` Task 1 |
| `{id}` → `{client_id}`, `{matter_id}`, `{invoice_id}` | `2026-04-03-api-non-breaking-fixes.md` Task 3 |
