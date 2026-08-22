# U6 Intake Operations — Agent Handoff

## Role

You are the implementation agent for U6 of the KrabiClaw-authenticated Blawby legal facade. Work in the Blawby backend repository as a TypeScript, Hono, Drizzle, Stripe, and Vitest engineer. Follow `AGENTS.md` and `docs/CODING_STANDARDS.md` as binding repository conventions.

## Goal

Extract the approved practice-client-intake use cases into auth-independent, domain-owned Legal Operations, while keeping existing Blawby routes behaviorally stable. Existing services must retain Better Auth/CASL authorization and their public contracts, then delegate to the operations. This work prepares the domain layer for the future KrabiClaw facade; it does not mount facade routes.

## Context

- The authoritative U6 specification is `docs/plans/2026-08-08-001-feat-krabiclaw-legal-facade-plan.md`, section `U6. Extract intake operations`.
- The branch is `feat/krabiclaw-u6-intake-operations`, based on the completed U5 work. Reuse the Legal Operation pattern in `src/modules/practice/operations/` and `src/modules/onboarding/operations/`.
- Current intake implementation is mainly under `src/modules/practice-client-intakes/`:
  - `services/intake-creation.service.ts` — settings, public create, update.
  - `services/intake-checkout.service.ts` — Checkout, intake status, post-pay status.
  - `services/intake-lifecycle.service.ts` — staff list, get, triage, and unrelated conversion/invitation work.
  - `services/intake-access.helpers.ts` — current route authorization/tenant checks.
  - `services/intake-stripe.helpers.ts`, `webhooks.ts`, `listeners.ts`, and `src/modules/webhooks/services/practice-client-intakes-webhooks.service.ts` — payment and fulfillment behavior that must remain intact.
  - `database/schema/practice-client-intakes.schema.ts` and `database/queries/practice-client-intakes.repository.ts` — includes the existing nullable `krabiclaw_request_key` and idempotent `createWithKrabiClawRequestKey` support from U3.
- Existing route tests live in `test/modules/practice-client-intakes/`; inspect all relevant tests and callers before edits.
- Characterization baseline observed before any U6 code changes: `pnpm exec vitest run test/modules/practice-client-intakes/intakes.test.ts` ran 26 tests, 18 passed and 8 failed. Most failures assert the obsolete `{ success, data }` response envelope even though handlers return direct JSON; the settings test also received `503` because its fixture lacks a published template. Treat these as pre-existing test debt unless a U6 change touches the same contract; do not claim a clean baseline without resolving or explicitly preserving it.

## Constraints

- Keep each Legal Operation in `src/modules/practice-client-intakes/operations/`, with one domain use case per operation. Operations accept `LegalOperationContext`, perform their own tenant assertion, and must not accept Better Auth sessions, CASL abilities, Hono contexts, D1 clients, or external IDs.
- Existing services remain authorization wrappers: retain their signatures, CASL behavior, response DTOs, errors, persistence ordering, events, and Stripe behavior. Translate with `toLegalOperationContext(ctx)` only after authorization.
- Extract only the facade-approved intake surface: settings, create, request-key lookup/recovery, Checkout session, status, post-pay status, staff list, staff get, and staff triage. Leave conversion, invitations, files, enrichment, invoices, facade HTTP mounting, and KrabiClaw BFF work out of scope unless a direct dependency requires a narrow move.
- For facade-created intakes, use the existing `(organization_id, krabiclaw_request_key)` idempotency binding. A same-key retry must return/recover the original intake and must not create a duplicate Stripe or legal record. Preserve anonymous actors without a local user row.
- Preserve destination-charge Checkout and the existing two-webhook fulfillment architecture. Jobs and webhooks must not query D1. Do not add a new payment state machine or payment endpoint.
- The facade may bypass only Blawby’s local subscription check after KrabiClaw entitlement enforcement. Existing Blawby routes must continue to enforce their current subscription behavior.
- Use `uow.transaction(...)` for application transaction boundaries and `getActiveTx()` in repository code. Do not use direct module-level `db.transaction(...)`.
- Do not use `any`, broad type assertions, relative imports in `src/`, or speculative wrappers. Keep additions small and domain-specific.
- Before behavior changes, inspect existing tests and capture a failing/characterization proof where practical. Do not modify the plan body for progress tracking.

## Output

Deliver a focused U6 change set containing:

1. Auth-independent intake operations in the intake domain, with existing services delegating after their current authorization checks.
2. Any minimal repository/schema support required for durable request-key recovery and immutable operation snapshots; generate and inspect a migration if the schema changes.
3. Focused tests covering parity and the required recovery/payment safety behavior.
4. A short final report with changed files, the exact operations extracted, test evidence, baseline failures that remain, and any deliberate scope exclusions.

Do not open facade routes, change human authentication, alter Stripe webhook destinations/secrets, or commit unrelated cleanup.

## Verification

Before handoff, verify the current implementation—not just the plan—against these checks:

- Existing route authorization and DTO/error parity for settings, create, Checkout, status, list, get, and triage.
- Human and anonymous intake access; anonymous creation creates no local user anchor.
- Same request key replay/response-loss recovery creates one intake only; cross-tenant request/session mismatches are rejected.
- Existing-route subscription behavior remains unchanged; facade-only bypass is explicit and cannot be caller-controlled.
- Checkout preserves destination-charge behavior; duplicate and out-of-order Stripe events stay idempotent; async completion does not depend on D1.
- Run the smallest relevant Vitest tests while iterating. Then run `pnpm run typecheck`, `pnpm run format:check`, `pnpm run lint`, and lint every touched file. If a schema changes, run `pnpm run db:generate` and inspect the migration.
- Report test outcomes accurately. In particular, distinguish any existing `intakes.test.ts` failures described above from regressions introduced by U6.
