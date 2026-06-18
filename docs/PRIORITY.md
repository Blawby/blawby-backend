# Blawby Backend — Work Priority Tracker

> Single source of truth for prioritized work across all plan files and GitHub issues.
> Last updated: 2026-06-18
>
> Related: `docs/superpowers/TRACKING.md` (API remediation detail) | `ROADMAP.md` (product direction)
>
> Execution rule: before editing code or closing checklist items from this tracker, verify the claim against current code/tests/config/issues and record the evidence in the issue or final response. Historical plans and roadmap notes are leads, not proof.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Done |
| 🔄 | In progress |
| ⬜ | Not started |
| 🔒 | Blocked (dependency) |
| 🗄️ | Stale / archive candidate |

---

## P0 — Finish In-Flight

> Leave nothing half-done. These are actively started.

| Item | Ref | Status | Notes |
|------|-----|--------|-------|
| Complete Unit of Work migration cleanup | [#342](https://github.com/Blawby/blawby-backend/issues/342) | 🔄 | Mostly migrated; remaining cleanup is direct subscription transactions, event transaction option/threading, stale `Tx` helper naming, and one transaction-state check. |

---

## P1 — Core Architecture And Test Foundation

> Stabilization before larger product roadmap work.

| Item | Ref | Status | Notes |
|------|-----|--------|-------|
| Complete UoW cleanup | [#342](https://github.com/Blawby/blawby-backend/issues/342) | 🔄 | `ServiceContext.db` is gone; engagement-contracts already uses `getActiveTx()`. Remaining work is tracked in the issue checklist. |
| Improve real database integration test harness | [#337](https://github.com/Blawby/blawby-backend/issues/337) | ⬜ | Needed before large billing/intake/event automation work. |
| Historical UoW plan | `docs/plans/2026-06-04-001-refactor-db-ambient-context-plan.md` | 🗄️ | Do not execute directly without re-verifying each claim against current code. |

**Verified done:** ALS foundation exists in `src/shared/database/uow.ts`; `ServiceContext` no longer exposes `db`; engagement-contracts repositories use `getActiveTx()`.

---

## P2 — Test Suite

> Plans written, no code yet. E2E plan is fully specced.

| Item | Ref | Status | Notes |
|------|-----|--------|-------|
| E2E API test suite (Vitest + Supertest) | `test/PLAN.md` | ⬜ | 790-line spec, drop/recreate DB strategy |
| engagement-contracts tests | `docs/plans/2026-05-22-engagement-contracts-tests-plan.md` | ⬜ | |
| Flow tests (intake→client, intake→contract) | `docs/plans/2026-05-22-flow-tests-plan.md` | ⬜ | |
| Practice tests | `docs/plans/2026-05-22-practice-tests-plan.md` | ⬜ | |
| OAuth provider integration tests | `docs/plans/2026-05-24-oauth-provider-tests-plan.md` | ⬜ | |
| Test emails + events | [#280](https://github.com/Blawby/blawby-backend/issues/280) | ⬜ | |

---

## P3 — MCP / AI Cluster

> MCP CRUD expansion is no longer blank-slate work. #320 is closed; remaining work is AI configuration/skills.

| Item | Ref | Status | Notes |
|------|-----|--------|-------|
| AI provider at practice level | [#292](https://github.com/Blawby/blawby-backend/issues/292) | ⬜ | Small. Unblocks #316 |
| MCP route annotation + codegen | `docs/plans/2026-05-25-001-feat-mcp-route-annotation-codegen-plan.md` | ✅ | Generated registry exists at `src/modules/mcp/mcp.tools.generated.ts`; verify before extending. |
| Practice AI Skills (MCP + chatbot parity) | [#316](https://github.com/Blawby/blawby-backend/issues/316) | ⬜ | |
| More MCP tools / write safety | [#320](https://github.com/Blawby/blawby-backend/issues/320) | ✅ | Issue closed; tests cover scope enforcement and approval flow. |

---

## P4 — Product Roadmap Work

> Use `ROADMAP.md` for sequence. Convert each open product item into a verified GitHub issue before implementation.

| Item | Ref | Status | Notes |
|------|-----|--------|-------|
| Intake conversations → PostgreSQL | [#308](https://github.com/Blawby/blawby-backend/issues/308) `ROADMAP.md` | ✅ | Backend module exists under `src/modules/intake-conversations`; verify worker write-through separately. |
| Backend intake enrichment job | [#344](https://github.com/Blawby/blawby-backend/issues/344) `ROADMAP.md` | ⬜ | Verified issue exists; do not recreate existing intake schema work. |
| Engagement AI generation backend service | [#345](https://github.com/Blawby/blawby-backend/issues/345) `ROADMAP.md` | ⬜ | Verified issue exists; engagement templates are already first-class resources. |

---

## P5 — API Standardization

> Track 2 + 3 from `docs/superpowers/TRACKING.md`. Non-breaking first, breaking needs frontend sign-off.

| Item | Ref | Status | Notes |
|------|-----|--------|-------|
| `{uuid}` → `{practice_id}` in practice routes | `docs/superpowers/plans/2026-04-03-api-non-breaking-fixes.md` Task 1 | ⬜ | Non-breaking |
| `{id}` → `{client_id}`, `{matter_id}`, `{invoice_id}` | same plan Task 3 | ⬜ | Non-breaking |
| DELETE endpoints → 204 | `docs/superpowers/plans/2026-04-03-api-breaking-standardization.md` Tasks 1a–1d | ⬜ | **Breaking — needs frontend coordination** |
| List response envelopes → `{ data, pagination }` | same plan Tasks 2a–2c | ⬜ | **Breaking** |
| REST verb violations (`GET /list`, `POST /cancel`, etc.) | same plan Task 3 | ⬜ | **Breaking** |
| `PUT` → `PATCH` for partial updates | same plan Task 3e | ⬜ | **Breaking** |
| Track 3: handler exports, file naming, misplaced files, event orphans, datetime validation, zod imports | `docs/superpowers/TRACKING.md` Track 3 | ⬜ | After Track 2 |

**Action needed:** Schedule frontend coordination meeting for breaking changes before touching P5 breaking items.

---

## P6 — Engineering Cleanup Backlog

> Concrete GitHub issues extracted from archived `plans/*.md` files. Use these instead of executing the old plans.

| Item | Ref | Status | Notes |
|------|-----|--------|-------|
| Finish remaining module standardization cleanup | [#334](https://github.com/Blawby/blawby-backend/issues/334) | ⬜ | Practice-client-intakes, subscriptions, trust, practice handler exports |
| Refactor trust and invoice workflows toward deeper modules | [#335](https://github.com/Blawby/blawby-backend/issues/335) | ⬜ | Architecture cleanup; verify interfaces before refactor |
| Standardize module structure, naming, and event-definition layout | [#336](https://github.com/Blawby/blawby-backend/issues/336) | ⬜ | Non-breaking structural cleanup |
| Improve real database integration test harness | [#337](https://github.com/Blawby/blawby-backend/issues/337) | ⬜ | Supersedes stale DB test plan details |
| Tighten TypeScript type safety and strictness gates | [#338](https://github.com/Blawby/blawby-backend/issues/338) | ⬜ | Type safety and TSConfig hardening |

---

## P7 — Feature Backlog

| Item | Ref | Status | Notes |
|------|-----|--------|-------|
| Seed files for client/practice owner | [#294](https://github.com/Blawby/blawby-backend/issues/294) | ⬜ | Dev quality-of-life |
| Attorney/Member Capacity & Routing Metadata | [#279](https://github.com/Blawby/blawby-backend/issues/279) | ⬜ | |
| Contact/Intake Extended Fields (eligibility + discount) | [#278](https://github.com/Blawby/blawby-backend/issues/278) | ⬜ | |
| Combine Intake Acceptance + Magic Link Emails | [#197](https://github.com/Blawby/blawby-backend/issues/197) | ⬜ | Client onboarding UX |

---

## P8 — Defer / Archive

| Item | Ref | Notes |
|------|-----|-------|
| Observability / audit trail | `docs/brainstorms/observability-and-audit-trail.md` | Brainstorm done (Jun 4). Write plan when P1–P3 clear. |
| Checklist items | [#176](https://github.com/Blawby/blawby-backend/issues/176) | Too vague. Needs triage. |
| Clio Manage Integration | [#9](https://github.com/Blawby/blawby-backend/issues/9) | Explicit BACKLOG. Ignore. |

---

## Stale Plan Files (do not execute from these)

The top-level `plans/*.md` files are historical context only. Do not execute them directly unless a user explicitly reactivates one and its claims are verified against current code. Current executable plans live under `docs/plans/`, `docs/superpowers/plans/`, and `test/PLAN.md`.

| File | Reason |
|------|--------|
| `plans/TECH_DEBT_REMEDIATION_PLAN.md` | No date |
| `plans/architectural-issues.md` | No date |
| `plans/fix-test-db-integration.md` | No date, superseded by test/PLAN.md |
| `plans/ideal-architecture.md` | No date, superseded by UoW plan |

Removed on 2026-06-16: historical Stripe/payment plan docs (`MASTER_IMPLEMENTATION_PLAN.md`, `STRIPE_SUBSCRIPTIONS_PLAN.md`, `STRIPE_SUBSCRIPTION_SYNC_AUDIT.md`, `LEGAL_BILLING_FUND_ROUTING_PLAN.md`, `INVOICES_REMAINING_WORK.md`, `blawby-ts-intake-payments-improvements.md`). Use git history if that old context is needed.
