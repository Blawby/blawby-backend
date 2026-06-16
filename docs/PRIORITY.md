# Blawby Backend — Work Priority Tracker

> Single source of truth for prioritized work across all plan files and GitHub issues.
> Last updated: 2026-06-16
>
> Related: `docs/superpowers/TRACKING.md` (API remediation detail) | `ROADMAP.md` (product direction)

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
| UoW U2: engagement-contracts class-based repository | `docs/plans/2026-06-04-001-refactor-db-ambient-context-plan.md` | 🔄 | Canonical pattern for U4–U7. |

---

## P1 — Core Architecture (UoW Refactor)

> In motion. U1 + U3 already committed. U2 unblocks U4–U7. U8 requires all done.

| Item | Ref | Status | Notes |
|------|-----|--------|-------|
| UoW U2: engagement-contracts class repo | `docs/plans/2026-06-04-001-refactor-db-ambient-context-plan.md` | 🔄 | See P0 |
| UoW U4: clients module | same plan | ⬜ | Independent after U1 |
| UoW U5: matters module | same plan | ⬜ | Removes last `Tx`-suffix helpers |
| UoW U6: invoices module | same plan | ⬜ | Most tx threading (74 sites) |
| UoW U7: subscriptions, practice, shared repos, financial engines | same plan | ⬜ | Includes trust `pg_advisory_xact_lock` |
| UoW U8: remove `ServiceContext.db`, remove `tx` from `ctx.emit()` | same plan | 🔒 | Blocked until U2–U7 done |
| UoW U9: update codemod for class-based repos | same plan | ⬜ | Depends on U2 |

**Already done:** U1 (ALS foundation `56cb35e`), U3 (intake module `d279801` + `e1df0a3`)

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

> 3 open GH issues. #292 is small prerequisite for the rest.

| Item | Ref | Status | Notes |
|------|-----|--------|-------|
| AI provider at practice level | [#292](https://github.com/Blawby/blawby-backend/issues/292) | ⬜ | Small. Unblocks #316 |
| MCP route annotation + codegen (U1–U7) | `docs/plans/2026-05-25-001-feat-mcp-route-annotation-codegen-plan.md` | ⬜ | |
| Practice AI Skills (MCP + chatbot parity) | [#316](https://github.com/Blawby/blawby-backend/issues/316) | ⬜ | |
| More tools | [#320](https://github.com/Blawby/blawby-backend/issues/320) | ⬜ | Likely flows from #316 |

---

## P4 — Major Product Feature

> ROADMAP calls Conversations→PG the #1 priority. No plan exists — brainstorm first.

| Item | Ref | Status | Notes |
|------|-----|--------|-------|
| Conversations → PostgreSQL (D1 → backend) | [#308](https://github.com/Blawby/blawby-backend/issues/308) `ROADMAP.md` §1 | ⬜ | Brainstorm → plan before code |

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
