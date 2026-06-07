# Blawby Remediation — Master Tracking Index

> Single source of truth for all planned work. Update status as items complete.
> Audit source: `inconsistencies-audit.md` | Design: `specs/2026-04-25-inconsistencies-remediation-design.md`

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Done |
| 🔄 | In progress |
| ⬜ | Not started |
| 🔒 | Blocked (dependency) |

---

## Track 1 — Error Handling Migration (Audit Item 1 + Item 2 remainder)

> Prerequisite for Track 2. Migrate all modules from `Result<T>` / `sendResult` → throw-based `HTTPException`.
> Execution order: matters → trust → subscriptions → practice-client-intakes → onboarding → stripe

**Audit Item 1 — Error Handling: Two Incompatible Patterns** | Severity: High

Modules still using `Result<T>` / `sendResult`:

| Module | Status | Notes |
|--------|--------|-------|
| `matters/` | ✅ | Migration landed; `unlinkUpload` returns `204 No Content` |
| `trust/` | ✅ | `assertTrust*Access` helpers removed; `syncBalanceAndCheckThreshold` try/catch fixed |
| `subscriptions/` | ✅ | Handler-facing services throw-based; worker-facing services use raw `Error` |
| `practice-client-intakes/` | ✅ | Helpers, services, handlers migrated |
| `onboarding/` | ✅ | Migrated; legacy named exports removed from `connected-accounts.service.ts` |
| `stripe/` | ✅ | `getConnectedAccountHandler` cleaned up; legacy exports removed from `stripe.webhook-events.repository.ts` |
| Services returning `Result<{ success: true }>` for deletes | ✅ | All modules now `Promise<void>` / `204` |

**Audit Item 2 — `engagement-contracts` Module Deviations** | Severity: High

| Sub-item | Status |
|----------|--------|
| ~~Used raw `createRoute()` instead of `routeBuilder.build()`~~ | ✅ |
| ~~No `practice_id` in route paths~~ | ✅ |
| ~~Generic `{id}` param instead of `{contract_id}`~~ | ✅ |
| ~~Exported handlers as `engagementContractHandlers` instead of `handlers`~~ | ✅ |
| ~~Handler `{ id }` destructuring instead of `{ contract_id: id }`~~ | ✅ |
| `practice_id` URL param not validated against session active organization in handler/service flow | ✅ |

Remaining item tracked in: `plans/2026-04-25-error-handling-stripe.md` Task 2

---

## Track 2 — API Surface Standardization

> Coordinate with frontend before shipping (breaking changes). Start after Track 1 is done.

| Item | Plan | Status | Notes |
|------|------|--------|-------|
| DELETE endpoints → 204 (Tasks 1a–1d) | `plans/2026-04-03-api-breaking-standardization.md` | ⬜ | Breaking |
| List response envelopes → `{ data, pagination }` (Tasks 2a–2c) | `plans/2026-04-03-api-breaking-standardization.md` | ⬜ | Breaking |
| REST verb violations — `GET /list`, `POST /cancel`, etc. (Task 3) | `plans/2026-04-03-api-breaking-standardization.md` | ⬜ | Breaking |
| `PUT` → `PATCH` for partial updates (Task 3e) | `plans/2026-04-03-api-breaking-standardization.md` | ⬜ | Breaking |
| `{uuid}` → `{practice_id}` in practice routes (Task 1) | `plans/2026-04-03-api-non-breaking-fixes.md` | ⬜ | Non-breaking |
| `{id}` → `{client_id}`, `{matter_id}`, `{invoice_id}` (Task 3) | `plans/2026-04-03-api-non-breaking-fixes.md` | ⬜ | Non-breaking |

---

## Track 3 — Structural Cleanup

> Non-breaking internal cleanup. Ship after Track 2 (avoids touching same files twice).
> Plans TBD — write when Track 2 ships.

**Audit Item 3 — Handler Export Style** | Severity: Medium

Three different patterns exist — standardize to `export const handlers = { ... }` (bundled object):

| Sub-item | Status |
|----------|--------|
| `clients/` — individual named exports → bundled object | ⬜ |
| `practice/` — individual named exports → bundled object | ⬜ |
| `clients/` mixed (both styles) — deduplicate | ⬜ |

---

**Audit Item 4 — File and Directory Naming** | Severity: Medium

| Sub-item | Status |
|----------|--------|
| 4a: `invoices/schemas/` → `invoices/validations/` | ⬜ |
| 4a: `preferences/schema/` → `preferences/validations/` | ⬜ |
| 4b: Rename `.repository.ts` → `.queries.ts` in `practice/`, `invoices/`, `onboarding/`, `subscriptions/`, `practice-client-intakes/` | ⬜ |
| 4c: `subscriptions/services/` — rename `meteredProducts.service.ts`, `subscriptionWebhooks.service.ts`, `syncPlans.service.ts` to kebab-case | ⬜ |

---

**Audit Item 5 — Misplaced Files** | Severity: Medium

| Sub-item | Status |
|----------|--------|
| 5a: Move `invoices/services/invoice-lifecycle.handlers.ts` out of `services/` → `workers/` or `tasks/` | ⬜ |
| 5a: Move `invoices/services/invoice-metering.handlers.ts` out of `services/` | ⬜ |
| 5b: Move `invoices/refund-requests.handlers.ts` into `invoices/handlers.ts` or routes subdirectory | ⬜ |
| 5b: Move `invoices/refund-requests.routes.ts` → `invoices/routes/refund-requests.routes.ts` | ⬜ |

---

**Audit Item 6 — Orphaned / Unregistered Event Files** | Severity: Medium

| Sub-item | Status |
|----------|--------|
| 6a: `shared/events/definitions/clients.ts` — determine if needed; register or delete | ⬜ |
| 6b: `shared/events/definitions/engagement-contracts.ts` — import in `definitions.ts`, add to `EventClasses` | ⬜ |
| 6c: Move `practice/events/practice.events.types.ts` → `shared/events/definitions/practice.ts`, delete module-local file | ⬜ |

---

**Audit Item 7 — Service Size Violations** | Severity: Medium

Only split when a file has multiple distinct responsibilities:

| File | Lines | Status |
|------|-------|--------|
| `invoices/services/refund-requests.service.ts` | 599 | ⬜ |
| `clients/services/clients-crud.service.ts` | 564 | ⬜ |
| `matters/services/matters.service.ts` | 556 | ⬜ |
| `engagement-contracts/services/engagement-contract.service.ts` | 460 | ⬜ |
| `subscriptions/services/subscription.service.ts` | 443 | ⬜ |
| `matters/services/matter-milestones.service.ts` | 416 | ⬜ |
| `practice-client-intakes/services/intake-lifecycle.service.ts` | 415 | ⬜ |
| `trust/services/trust.service.ts` | 391 | ⬜ |
| `webhooks/services/onboarding-webhooks.service.ts` | 372 | ⬜ |
| `matters/services/matter-time-entries.service.ts` | 372 | ⬜ |

---

**Audit Item 8 — `preferences` Handler Violations** | Severity: Medium

| Sub-item | Status |
|----------|--------|
| Uses `c.req.param('category')` instead of `c.req.valid('param')` | ⬜ |
| Handlers not typed as `AppRouteHandler<typeof route>` | ⬜ |
| Inline validation logic (`isValidPreferenceCategory`, `parseCategoryPayload`) | ⬜ |
| Returns `{ error: '...' }` shape instead of throwing `HTTPException` | ⬜ |
| Routes use `PUT /{category}` — should be `PATCH` (also in api-breaking-standardization Task 3e) | ⬜ |

---

**Audit Item 9 — Datetime Validation** | Severity: Low–Medium

Standardize to `z.iso.datetime({ offset: true })` everywhere in API schemas:

| Sub-item | Status |
|----------|--------|
| `invoices/schemas/` — `z.date()` → `z.iso.datetime({ offset: true })` | ⬜ |
| `preferences/` — `z.date()` → `z.iso.datetime({ offset: true })` | ⬜ |
| `clients/` — `z.date()` and `z.iso.datetime()` (no offset) → `z.iso.datetime({ offset: true })` | ⬜ |
| `worker-events/` — `z.iso.datetime()` (no offset) → add `{ offset: true }` | ⬜ |

---

**Audit Item 10 — Direct `zod` Imports** | Severity: Low

Import `z` from `@hono/zod-openapi`, not `'zod'`:

| File | Status |
|------|--------|
| `preferences/schema/preferences.schema.ts` | ⬜ |
| `preferences/validations/preferences.validation.ts` | ⬜ |
| `onboarding/schemas/onboarding.schema.ts` | ⬜ |
| `practice-client-intakes/services/intake-stripe.helpers.ts` (type import) | ⬜ |
| `subscriptions/types/subscription.types.ts` (type import) | ⬜ |
| `practice/types/practice.types.ts` (type import) | ⬜ |

---

**Audit Item 11 — Events with No Listeners** | Severity: Low

| Sub-item | Status |
|----------|--------|
| `trust/` — calls `ctx.emit(...)` but has no `listeners.ts` | ⬜ |
| `subscriptions/` — no `listeners.ts`; verify events aren't silently dropped | ⬜ |

---

## Quick Reference — Active Plan Files

| File | Track | Scope |
|------|-------|-------|
| `plans/2026-04-03-api-breaking-standardization.md` | 2 | breaking API changes |
| `plans/2026-04-03-api-non-breaking-fixes.md` | 2 | non-breaking API fixes |
