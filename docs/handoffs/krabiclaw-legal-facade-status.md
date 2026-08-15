---
artifact_contract: 'project-handoff-status/v1'
created_at: '2026-08-12T04:07:27Z'
updated_at: '2026-08-13T04:05:40Z'
title: 'KrabiClaw legal facade implementation status'
summary: 'Living handoff and evidence-based tracker for the short-term KrabiClaw-to-Blawby legal facade.'
keywords: ['krabiclaw', 'blawby', 'legal-facade', 'oauth', 'd1', 'stripe-connect', 'intakes', 'engagements']
resume_focus: 'Verify the next incomplete unit against code and GitHub, complete or review it, and update this tracker after its PR merges.'
repository: 'blawby-backend'
repo_root_sha: '651a2a0e52f2e61cf8ba44e66a5f96c9921105cc'
branch: 'feat/krabiclaw-u4-integration-adapter'
head: '42de7cad8e1a60f96681d5dc39909428a3e28ff7'
---

# KrabiClaw legal facade: living handoff and status tracker

> This is a mutable repository tracker, not an immutable session snapshot.
> Update it only after verifying current code and GitHub state. A PR being open,
> green, or described as complete is not evidence that it has merged or is
> operational.

## Objective

Let KrabiClaw use selected Blawby legal operations without changing either
product's current human authentication.

- KrabiClaw remains authoritative for browser sessions, users, organizations,
  memberships, roles, subscriptions, entitlements, and anonymous identity.
- Blawby authenticates one fixed KrabiClaw confidential client and owns legal
  data, transactions, jobs, Stripe Connect, and selected legal operations.
- The integration is a temporary, versioned microservice facade rather than an
  auth migration.
- Existing Blawby routes and KrabiClaw product behavior must remain stable while
  the facade is introduced behind default-off gates.

The implementation-ready source of truth is
[`docs/plans/2026-08-08-001-feat-krabiclaw-legal-facade-plan.md`](../plans/2026-08-08-001-feat-krabiclaw-legal-facade-plan.md).
The domain/auth boundary is recorded in
[`docs/adr/0001-keep-legal-operations-independent-of-auth.md`](../adr/0001-keep-legal-operations-independent-of-auth.md).

## Done so far

### Completed and merged

- The short-term product boundary, route scope, stop conditions, delivery
  sequence, and definition of done have been consolidated into the
  implementation-ready master plan.
- The auth/domain separation decision has been accepted: facade adapters and
  existing Blawby routes must call the same auth-independent Legal Operations;
  integration-specific copies of legal workflows are prohibited.
- **U1 is merged:** Blawby's existing Better Auth server can issue a scoped,
  one-hour `client_credentials` token to one fixed KrabiClaw confidential
  client. Legal scopes are excluded from public dynamic client registration.
- OAuth client creation, rotation, emergency revocation, secret handling, and
  audit ownership are documented in the OAuth runbook.
- **U2 is merged:** Blawby has a narrow read-only KrabiClaw D1 adapter using the
  official Cloudflare SDK. It exposes only fixed organization and user lookups,
  validates strict response shapes, rejects write metadata, uses a shared
  three-second budget, retries only classified transient failures once, and
  sanitizes errors.
- **U3 is merged:** external identity links, concurrency-safe local anchors,
  intake request-key idempotency, and Connect recovery snapshots landed through
  PR #420 at merge commit `2591bed2c4b412124f19df3c1d95dc77d433046d`.
- The D1 staging capacity-gate procedure and Worker fallback condition are
  documented.
- The merged OAuth and D1 foundation currently passes focused tests, typecheck,
  and build on `staging`.
- Separately, KrabiClaw merged its Better Auth Stripe subscription and billing
  reconciliation work in PR #536. KrabiClaw therefore remains the working
  short-term authority for SaaS subscriptions and entitlements.

### Implemented in branches but not complete

- **U4 code exists in PR #421:** fixed-client token verification, strict
  facade identity headers, immutable actor attribution, a default-off kill
  switch, and composed middleware. It is not done until the branch is updated
  against merged `staging`, reviewed, and merged.
- U4 intentionally exposes no legal facade routes yet. The integration is not
  usable from KrabiClaw merely because its middleware has been written.

### Overall progress

- **Merged implementation units:** 3 (`U1`, `U2`, `U3`)
- **Implemented but unmerged units:** 1 (`U4`)
- **Not-started required units:** 6 (`U5`–`U10`)
- **Conditional unit:** `U11`, required only if direct D1 REST fails its
  production-shaped capacity gate
- **End-to-end legal facade availability:** none yet

## Status legend

- **Merged:** present on `origin/staging` and verified in the current checkout.
- **Open:** implemented in a PR but not part of `staging`.
- **Blocked:** work must not advance past the named gate.
- **Not started:** no implementation PR or current-code evidence was found.
- **Conditional:** required only if its triggering condition occurs.

## Implementation status

| Unit                                     | Status                                   | Evidence                                                                                                                                      | What remains                                                                                           |
| ---------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| U1 — Machine OAuth                       | **Merged**                               | [PR #418](https://github.com/Blawby/blawby-backend/pull/418); legal audience/scopes in `src/shared/auth/better-auth.ts`; provisioning runbook | Provision the fixed client per deployed environment and record staging verification                    |
| U2 — Read-only D1 directory adapter      | **Merged**                               | [PR #419](https://github.com/Blawby/blawby-backend/pull/419); `src/modules/krabiclaw-integration/services/krabiclaw-directory.service.ts`     | Run and record the production-shaped staging capacity gate                                             |
| U11 — D1-bound Worker fallback           | **Conditional / blocked by gate result** | Defined in the master plan; no implementation found                                                                                           | Implement only if direct D1 REST fails the capacity gate                                               |
| U3 — Identity links and recovery records | **Merged**                               | [PR #420](https://github.com/Blawby/blawby-backend/pull/420); merge commit `2591bed2c4b412124f19df3c1d95dc77d433046d`                         | Run the D1 capacity gate before real traffic                                                           |
| U4 — Trusted integration adapter         | **Open; review required**                | [PR #421](https://github.com/Blawby/blawby-backend/pull/421), based on `staging`                                                              | Update against merged `staging`, review, then merge; it intentionally exposes no legal routes          |
| U5 — Practice and Connect operations     | **Not started**                          | No implementation PR found                                                                                                                    | Extract auth-independent operations while preserving existing routes and CASL behavior                 |
| U6 — Intake operations                   | **Not started**                          | No implementation PR found                                                                                                                    | Extract selected intake/payment operations and prove idempotency and webhook parity                    |
| U7 — Engagement operations               | **Not started**                          | No implementation PR found                                                                                                                    | Extract the selected lifecycle and prove transition/PDF/matter/note parity                             |
| U8 — Blawby facade routes                | **Not started**                          | No implementation PR found                                                                                                                    | Expose only the approved route/method/scope matrix under `/api/integrations/krabiclaw/v1`              |
| U9 — KrabiClaw BFF routes                | **Not started**                          | No matching KrabiClaw legal-facade PR found                                                                                                   | Add session-authorized server routes, service-token handling, header stripping, rate limits, and flags |
| U10 — Vertical rollout                   | **Not started**                          | No canary or rollout evidence found                                                                                                           | Deploy dormant infrastructure, verify gates, canary vertical slices, and rehearse rollback             |

## Related KrabiClaw state

- [KrabiClaw PR #536](https://github.com/paulchrisluke/krabiclaw/pull/536)
  merged on 2026-08-06. It converged subscription handling on Better Auth
  Stripe and added billing/reconciliation hardening.
- That work is relevant to short-term subscription authority, but it does not
  implement the Blawby legal facade or its BFF routes.
- The GitHub discussion still contains only the original architecture response:
  [discussion #417](https://github.com/Blawby/blawby-backend/discussions/417#discussioncomment-17902249).

## Verified baseline

Verified on 2026-08-12 against clean `staging` at
`5cd7e3332a3fa3efdd9eb99c70341b7361acabfe`:

- `origin/staging` and the local `staging` checkout matched.
- Focused merged U1/U2 tests passed: **45/45** across six test files.
- `pnpm run typecheck` passed.
- `pnpm run build` passed.
- The working tree was clean after validation.
- No usable practice, Connect, intake, or engagement facade routes existed on
  `staging`.

## Open decisions and gates

### 1. D1 transport capacity gate

**Status: BLOCKING REAL TRAFFIC.**

The direct Cloudflare D1 REST adapter exists, but no recorded staging result was
found. Run the procedure in
[`docs/runbooks/krabiclaw-d1-capacity-gate.md`](../runbooks/krabiclaw-d1-capacity-gate.md)
and record:

- projected sustained peak and retry-amplified request rates;
- p50, p95, and p99 latency;
- overloaded and deadline-failure rates; and
- percentage of the account-wide Cloudflare API limit.

If it fails, implement U11 before relying on U3/U4. If it passes, store the
measurements in a staging verification artifact and link it here.

### 2. External ID versus same-ID design

**Status: RESOLVED BY U3 MERGE.**

An earlier short-term proposal reused the KrabiClaw organization ID as the
Blawby practice ID to avoid mapping machinery. The accepted implementation plan
instead keeps external identifiers out of legal foreign keys and uses separate
one-to-one link tables plus minimal local UUID anchors. PR #420 implements the
latter.

PR #420 merged with the link-table design, accepting:

- separate external-ID links for isolation and collision detection;
- stable local UUID anchors for legal persistence keys; and
- no coupling between KrabiClaw identifiers and Blawby legal foreign keys.

### 3. OAuth operational provisioning

**Status: CODE COMPLETE, ENVIRONMENT VERIFICATION MISSING.**

The provisioning and rotation paths exist in
[`docs/runbooks/krabiclaw-oauth-client.md`](../runbooks/krabiclaw-oauth-client.md).
Before end-to-end traffic:

- provision exactly one staging client;
- store the client ID/secret in the appropriate secret stores;
- configure Blawby's accepted client ID;
- verify token audience, issuer, `azp`, expiry, and route scopes; and
- exercise rotation/revocation without recording secrets in this document.

### 4. Payments and webhooks

**Status: REQUIRED BEFORE PAYMENT SLICE.**

Verify both Stripe destinations and secrets, automatic test-mode payment
completion, duplicate/out-of-order event behavior, response-loss recovery, and
reconciliation before enabling intake payments. KrabiClaw's subscription
webhook work and Blawby's Connect/platform payment webhooks remain separate
ownership paths.

## Fresh-agent execution protocol

This tracker is the orientation index; it is not enough by itself to authorize
or safely implement a domain unit. A context-free agent must recover current
state from the tracker, then ground the selected unit in current code and a
unit-specific implementation plan.

### Starting a new session

First run:

```text
$ce-handoff resume docs/handoffs/krabiclaw-legal-facade-status.md
```

The resume workflow will orient the agent and stop. After it reports the current
state, explicitly confirm the next action. For a not-started unit, use this
template:

```text
Create an implementation-ready plan for <UNIT> from its current target branch.
Read AGENTS.md, the living handoff, the master legal-facade plan, ADR 0001, the
merged prerequisite implementation, and the selected unit's context packet.
Inspect its existing domain code, call sites, schemas, side effects, and tests.
Verify every claim against current code and GitHub. Do not implement until the
plan identifies exact boundaries, preserved contracts, transactions,
failure/recovery behavior, validation, sequencing, and non-goals.
```

For U4, which already has an open PR, request a current-base review and
merge-readiness plan instead of generating a second implementation. Treat U3
as merged prerequisite code. Once a unit-specific plan has been reviewed and
accepted, a fresh implementation agent can be given the plan through the
repository's work workflow. Do not ask an agent to implement a unit from its
title alone.

### Required reading order for any implementation unit

1. `AGENTS.md` and `docs/CODING_STANDARDS.md` for current repository rules.
2. This tracker for verified progress, blockers, PR order, and current head.
3. The master plan's product contract, route scope, relevant unit, key technical
   decisions, verification contract, and definition of done.
4. ADR 0001 for the auth-independent Legal Operation boundary.
5. The current merged implementation of prerequisite units and their tests.
6. Existing domain implementation, all call sites, public contracts, database
   schema, events/jobs, and focused tests for the selected unit.
7. Current GitHub PRs/issues where the unit depends on unmerged or recently
   changed work.

Plans and handoffs are context, not proof. Current implementation and tests win
when documentation has drifted; material conflicts must be surfaced before
editing code.

### Reviewing a PR in a fresh session

Yes—a fresh agent can review any facade PR with enough context, provided the
review is explicitly anchored to this tracker, the master plan, the applicable
unit packet, and the PR's actual base. The reviewer must not infer the intended
contract from the diff alone.

Use two turns because the handoff resume workflow intentionally stops after
orientation.

**Turn 1 — recover context:**

```text
$ce-handoff resume docs/handoffs/krabiclaw-legal-facade-status.md
```

**Turn 2 — run the report-only review:**

```text
Review PR <PR_NUMBER> as implementation unit <UNIT>, using
docs/handoffs/krabiclaw-legal-facade-status.md and the <UNIT> context packet.
Run a full report-only code review against the PR's real base and use
plan:docs/plans/2026-08-08-001-feat-krabiclaw-legal-facade-plan.md for
requirements verification. Read AGENTS.md, docs/CODING_STANDARDS.md, ADR 0001,
the relevant current implementation and tests, PR discussion/review threads,
and prerequisite merged units. Do not modify code, check out another branch,
push, merge, or resolve comments.

Separate: (1) reproducible code defects, (2) missing unit requirements,
(3) unresolved architectural or operational gates, (4) stacked-branch/base
dependencies, (5) test or validation gaps, and (6) non-blocking follow-ups.
Recheck existing comments against the latest PR head so already-fixed or
outdated feedback is not repeated. Finish with the exact reviewed head/base,
validation performed, and one verdict: Ready to merge, Ready with fixes, Not
ready, or Code-ready but blocked by an external gate.
```

For the current facade PRs, replace the placeholders as follows:

| PR                                                        | Unit        | Review emphasis                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#420](https://github.com/Blawby/blawby-backend/pull/420) | U3 (merged) | Identity-link concurrency and uniqueness; request-key idempotency; Connect recovery state; migrations; D1 gate as a separately reported operational dependency                                                                               |
| [#421](https://github.com/Blawby/blawby-backend/pull/421) | U4          | Confirm the reviewed diff excludes inherited U3 changes or identifies them as its stack; fixed-client/scope enforcement; trusted-header rejection; immutable actor attribution; default-off kill switch; no prematurely exposed legal routes |

The review report must distinguish **code merge readiness** from **rollout
readiness**. An operational gate such as the D1 capacity test can block rollout
or, where the plan explicitly makes it an entry condition, block merge; it is
not automatically a code defect. U3 has merged; U4's base/diff must now be
refreshed and reviewed against current `staging`.

If the review finds changes worth making, start a separate feedback-resolution
session after the user selects the findings. A report-only reviewer does not
silently edit the PR, and a clean review does not update this tracker—the
tracker changes only when verified repository or GitHub state changes.

## Remaining-unit context packets

Every remaining unit must have a unit-specific plan or review packet grounded
in the code at the branch it will use. Each packet must state its entry
conditions, exact files and call sites, preserved contracts, transactions and
side effects, failure/recovery behavior, focused tests, broader validation,
non-goals, and merge/rollback boundary. The summaries below are minimum
requirements, not substitutes for inspecting current code.

### U3 — Identity links and recovery records

This is the post-merge verification packet for PR #420, not a request to
reimplement the unit.

- **Entry conditions:** U3 merged with the external-link-table design; record
  the D1 capacity-gate result before real traffic.
- **Inspect:** the complete #420 diff against current `staging`; integration
  link schemas, repositories, and resolver; generated migration; intake
  request-key schema/query path; Connect operation snapshot schema/repository;
  all PostgreSQL-backed tests and affected call sites.
- **Required invariants:** one-to-one external links; no local auth membership,
  role, credential, session, or subscription creation; anonymous actors never
  create user anchors; advisory-lock serialization; rollback leaves no orphan
  anchors; request keys are tenant-scoped; Connect recovery identifies one
  stable operation.
- **Validation:** migration generation/inspection, real-PostgreSQL first/repeat/
  concurrent/collision/timeout/rollback cases, focused intake and onboarding
  recovery tests, typecheck, format, lint, and build on the final head.
- **Non-goals:** no HTTP routes, D1 transport changes, Stripe calls, legal
  workflow extraction, or KrabiClaw repository changes.
- **Exit:** complete; #420 merged into `staging` as
  `2591bed2c4b412124f19df3c1d95dc77d433046d`.

### U4 — Trusted integration adapter

This is currently a review-and-merge packet for PR #421.

- **Entry conditions:** U3 is merged; refresh the branch against `staging` and
  confirm the accepted identity model is reflected in the diff.
- **Inspect:** #421 against its actual U3 base and then against updated
  `staging`; U1 OAuth claims/config; U2 directory adapter; U3 resolvers; strict
  header parser; token verifier; `LegalOperationContext`; audit event and
  persistence; middleware order; HTTP mount; config and router generation.
- **Required invariants:** verify OAuth before trusting integration identity;
  require correct issuer, audience, expiry, fixed client `azp`, no human `sub`,
  and a relevant `legal:*` scope; reject missing, duplicated, malformed, or
  inconsistent headers; apply organization-scoped rate limiting before D1,
  PostgreSQL, or audit work runs; resolve IDs before mutation; persist
  immutable actor attribution; keep the facade kill switch default-off.
- **Rate-limit contract:** routed under the `krabiclaw-facade` rate-limit key,
  scoped per organization as `org:<externalOrganizationId>` (isolated per
  external organization, not shared globally); runs after OAuth verification
  and header parsing but before D1 directory access, PostgreSQL identity
  resolution, and attribution audit dispatch; a limited request returns 429
  without touching any of that downstream work.
- **Authorization dependency:** KrabiClaw owns owner/admin authorization in the
  short term. Blawby must document that trust boundary and must not invent roles
  from D1 fields it does not read.
- **Validation:** real Better Auth-issued token tests, wrong-client/scope/token
  cases, header spoofing/duplication cases, human/anonymous mapping, audit
  persistence, kill-switch 404, ordinary-route isolation, organization-scoped
  rate-limit isolation and pre-D1/PostgreSQL/audit placement, typecheck,
  format, lint, build, and focused shared-auth/integration tests.
- **Non-goals:** no practice, Connect, intake, or engagement facade routes and no
  domain workflow extraction.
- **Exit:** #421 merges with the facade still dormant; update this tracker before
  U5 begins from the merged base.

### U5 — Practice and Stripe Connect operations

- **Entry conditions:** U3 is merged and U4 is merged; identity and D1 transport
  decisions are settled.
- **Inspect:** exact practice details read/create/update workflows and all
  callers; Connect account creation, status, account-session, and account-read
  workflows; current handlers, services, repositories, jobs, webhooks, Stripe
  clients, schemas, events, and tests.
- **Operation boundary:** create one auth-independent Legal Operation per use
  case in the owning practice/onboarding domain. Existing services retain their
  signatures and CASL checks, translate `ServiceContext`, and delegate. Move the
  workflow; never copy it into the integration module.
- **Durability:** snapshot required D1 presentation facts before mutation;
  persist/resume one Connect operation and stable Stripe idempotency key before
  the external side effect; preserve transaction and event ordering.
- **Validation:** characterize existing routes first; prove DTO/error/persistence
  parity after extraction; test concurrent Connect creation, lost responses,
  webhook-before-finalization, retry/recovery, cross-tenant access, and D1
  unavailability during async work.
- **Non-goals:** no facade HTTP routes (U8), KrabiClaw BFF routes (U9), auth or
  subscription migration, copied workflows, or unrelated broad refactors.
- **Exit:** existing routes call the new operations without behavior drift; the
  U5 PR merges and this tracker records its evidence.

### U6 — Intake operations

- **Entry conditions:** the merged base contains required identity/recovery
  records and Legal Operation conventions established by earlier units.
- **Inspect:** settings, public create, request lookup, Checkout session, status,
  post-pay status, staff list/get/triage flows; schemas, repositories, events,
  listeners/jobs, both Stripe webhook paths, serializers, authorization, local
  subscription checks, and every existing caller/test.
- **Operation boundary:** extract one operation per approved intake use case.
  Existing routes keep Better Auth/CASL and local subscription behavior. Only
  the facade adapter may bypass Blawby's local subscription check after
  KrabiClaw has enforced its entitlement.
- **Durability:** bind the caller's durable request reference to one intake;
  snapshot actor/organization presentation facts; preserve destination-charge
  Checkout and fulfillment through existing webhooks/jobs; never query D1 from
  a job or webhook.
- **Validation:** human and anonymous flows, anonymous no-user behavior, same-key
  replay and response loss, cross-tenant/session mismatch, reviewed 4xx parity,
  old-route subscription behavior, duplicate/out-of-order Stripe events,
  automatic test payment, and D1-unavailable async completion.
- **Non-goals:** invoices, files, invitations, enrichment, conversion, new
  payment behavior, facade route mounting, or KrabiClaw BFF work.
- **Exit:** existing intake routes remain behaviorally stable, shared operations
  are merged, and payment/recovery evidence is linked here.

### U7 — Engagement operations

- **Entry conditions:** the Legal Operation pattern is merged and intake changes
  that affect engagement creation or shared types are stable.
- **Inspect:** create/list/get/update/status workflows, lifecycle validations,
  serializers, PDF/rendering, events, matter/note creation, repositories,
  transactions, all call sites, and existing engagement/matter/note tests.
- **Operation boundary:** human-only auth-independent operations live in the
  engagement domain; existing routes keep CASL and delegate without contract
  changes; the integration module owns only adaptation.
- **Required invariants:** tenant isolation; valid lifecycle transitions;
  immutable rendering/audit facts; existing event order; acceptance creates the
  related matter/note exactly once under retries or duplicate requests.
- **Validation:** existing CASL and DTO parity, anonymous/cross-tenant rejection,
  transition matrix, rendering snapshots, event behavior, concurrency/replay,
  and single matter/note creation.
- **Non-goals:** new engagement features, invitation/file expansion, generic
  CRUD/command buses, facade routes, or KrabiClaw BFF work.
- **Exit:** selected engagement workflows have one implementation shared by the
  existing adapter and future facade; merge evidence is recorded here.

### U8 — Blawby facade routes

- **Entry conditions:** U5-U7 operations required by the chosen first rollout
  slice are merged; U4 middleware is merged and default-off.
- **Inspect:** the master route-scope table, integration middleware/context,
  generated router conventions, each selected Legal Operation and DTO,
  pagination/error conventions, rate-limit infrastructure, and contract tests.
- **Required surface:** mount only reviewed methods and paths under
  `/api/integrations/krabiclaw/v1`; require the matching OAuth scope and actor
  kind; derive organization, user, practice, slug, and email server-side; reject
  caller-controlled identity fields.
- **Required behavior:** handlers remain thin; dependency failures occur before
  mutation; reviewed legal 4xx responses retain their semantics; D1/service
  failures are sanitized; per-organization route-family limits apply before
  costly work; the global kill switch remains default-off.
- **Validation:** complete route/method allowlist, scope/actor matrix, malformed
  identity attempts, kill switch, rate limits, response/pagination parity,
  dependency failure, OpenAPI/router generation, and proof ordinary APIs remain
  unchanged.
- **Non-goals:** browser session handling, KrabiClaw pages, new domain behavior,
  subscriptions, or enabling production traffic.
- **Exit:** dormant facade routes are merged with contract tests and no family
  enabled by default.

### U9 — KrabiClaw BFF routes

This unit is implemented in the sibling KrabiClaw repository and needs its own
repo-local plan based on that repository's current instructions and code.

- **Entry conditions:** the required Blawby facade slice is deployed but
  default-off; per-environment OAuth and HTTPS origin/path values are known.
- **Inspect:** current Better Auth session, organization, membership, role,
  entitlement, anonymous identity, server-route, rate-limit, feature-flag, and
  error-handling helpers; current API clients and relevant frontend consumers.
- **Required behavior:** validate the browser session/anonymous actor and
  organization inside KrabiClaw; enforce owner/admin policy where required;
  remove all browser-provided service/identity headers; obtain and coalesce a
  scoped service token; send only trusted actor/org headers and stable request
  references; call Blawby server-to-server.
- **Safety:** exact HTTPS return/refresh allowlists, short bounded timeouts, retry
  only token refresh and persisted same-operation recovery, public rate limits
  by hashed IP/actor/site/operation, sanitized 401/403/4xx/502/503 mapping, and
  a default-off flag per route family.
- **Validation:** token caching/renewal, secret isolation, header stripping,
  owner/admin and entitlement policy, anonymous actor isolation, request-key
  persistence, safe retries, error mapping, flags, and browser/server contract
  tests with no direct browser-to-Blawby calls.
- **Non-goals:** copying legal rules into KrabiClaw, direct PostgreSQL access,
  auth/subscription migration, or enabling all route families together.
- **Exit:** BFF routes are merged and deployed dormant; link their PR, deployed
  version, and validation here without storing secrets.

### U10 — Vertical rollout and operations

- **Entry conditions:** both repositories contain the dormant selected slice;
  required secrets/config are provisioned; all stop conditions have evidence.
- **Inspect:** exact deploy commits/versions, D1 gate results, OAuth client,
  route flags, observability, both Stripe destinations/secrets, payment and
  Connect recovery, reconciliation, rollback runbooks, and data-retention rules.
- **Rollout order:** practice read, practice mutation, Connect, intake without
  payment, test payment, live payment, then engagement. A later slice cannot
  compensate for missing evidence in an earlier one.
- **Required evidence:** production-shaped D1 load, fixed-client isolation,
  identity-link concurrency, response-loss recovery, duplicate/out-of-order
  webhooks, automatic payment completion, reconciliation, monitored canary,
  alarms/DLQ or failed-job handling, and rollback rehearsal.
- **Rollback:** disable KrabiClaw family flags first; do not delete retained
  legal, payment, mapping, snapshot, idempotency, or audit records.
- **Non-goals:** big-bang enablement, destructive rollback, authority migration,
  or declaring success from CI without deployed-candidate verification.
- **Exit:** each slice has a dated enablement record and evidence; schedule the
  temporary-seam review within 90 days and quarterly afterward.

### U11 — Conditional D1-bound Worker fallback

Do not implement this unit unless the recorded D1 REST capacity gate fails or a
later measured regression crosses its stop condition.

- **Entry condition:** a linked capacity-gate result identifies direct D1 REST
  as unacceptable; record the specific failed limit or reliability metric.
- **Inspect:** U2's public directory-service interface and tests, the current
  KrabiClaw Worker/wrangler structure, D1 bindings, service-auth patterns,
  deployment environments, rate limiting, and observability.
- **Required behavior:** expose only fixed typed organization/user lookups from
  a D1-bound Worker; authenticate Blawby with a dedicated environment-isolated
  credential; enforce request-size/rate limits and fail closed; keep raw SQL,
  arbitrary query capability, sessions, credentials, subscriptions, and CMS
  data outside the contract.
- **Compatibility:** preserve U2's caller-facing interface so only the transport
  changes; provide direct-REST versus Worker parity tests.
- **Validation:** auth, replay/malformed/oversized inputs, parity, load and rate
  isolation, D1 failures, secret rotation, deployment order, and a repeated
  production-shaped capacity gate.
- **Exit:** Worker transport is deployed and verified before identity/domain
  work depends on it; update U2/U11 statuses and evidence here.

After any unit is implemented and merged, update this tracker with its PR,
merge commit, validation evidence, cleared and remaining gates, and the next
unit's actual base state.

## Ordered next steps

### Immediate critical path

1. **Run the D1 staging capacity gate.** Record and link the evidence here.
2. **Update PR #421 onto merged `staging`, review it, and merge it.** Confirm the
   kill switch remains default-off and that no real routes are accidentally
   exposed.
3. **Provision and verify the staging OAuth client.** Keep credentials out of
   GitHub, logs, and this tracker.

### Domain and API delivery

4. **Implement U5: practice and Stripe Connect operations.** Begin with practice
   read, prove existing-route parity, then practice mutation and Connect
   recovery/idempotency.
5. **Implement U6: intake operations.** Preserve destination-charge Checkout
   and the current webhook/job fulfillment behavior.
6. **Implement U7: engagement operations.** Preserve lifecycle transitions,
   rendering/events, and exactly-once matter/note creation.
7. **Implement U8: versioned Blawby facade routes.** Mount only the approved
   method/path allowlist and derive identity fields server-side.
8. **Implement U9 in KrabiClaw.** Reuse current sessions and entitlements,
   cache/coalesce the service token, strip browser identity headers, and keep
   every route family default-off.

### Rollout

9. **Execute U10 in vertical slices:** practice read, practice mutation,
   Connect, intake without payment, test/live intake payment, then engagement.
10. **Verify rollback and monitoring:** disable KrabiClaw family flags first;
    retain legal/payment/audit records; monitor dependency errors, retries,
    identity-link conflicts, Stripe divergence, and unauthorized calls.
11. **Schedule the seam review:** within 90 days of first live traffic and
    quarterly afterward.

## Update procedure after every PR merge

The agent handling a merge must update this document in the same follow-up or
immediately afterward:

1. Verify the PR is actually merged on GitHub and capture its merge commit.
2. Update local `staging` and confirm the merge commit is present.
3. Inspect the merged implementation and focused tests; do not rely only on the
   PR description.
4. Run validation proportional to the change and record the result under
   **Verification log**.
5. Change the unit's table status to **Merged**, update its evidence, and remove
   only gates that have actually passed.
6. Update `updated_at`, `head`, **Current next action**, and the ordered next
   steps if sequencing changed.
7. Add one dated entry to **Change log**. Never store credentials, production
   tokens, raw personal data, or sensitive provider payloads here.

## Current next action

Run and record the D1 capacity gate, then update and review PR #421 against
merged `staging`.

## Verification log

| Date       | Head / PR         | Verification               | Result       |
| ---------- | ----------------- | -------------------------- | ------------ |
| 2026-08-12 | `staging@5cd7e33` | Focused U1/U2 Vitest files | 45/45 passed |
| 2026-08-12 | `staging@5cd7e33` | `pnpm run typecheck`       | Passed       |
| 2026-08-12 | `staging@5cd7e33` | `pnpm run build`           | Passed       |

## Change log

| Date       | Change                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-12 | Created the living handoff after reconciling the master plan, current `staging`, GitHub discussion #417, merged PRs #418/#419, open stacked PRs #420/#421, and KrabiClaw PR #536.          |
| 2026-08-12 | Added an explicit done-so-far summary that separates merged work, implemented-but-unmerged work, and end-to-end availability.                                                              |
| 2026-08-12 | Added the fresh-agent execution protocol and the minimum U5 context packet required before a context-free agent may plan or implement U5.                                                  |
| 2026-08-12 | Expanded the context-packet contract to every remaining unit: U3-U10 and conditional U11.                                                                                                  |
| 2026-08-12 | Added a fresh-agent PR review protocol with a copyable report-only prompt, unit-specific guidance for PRs #420/#421, and separate code-readiness, rollout-gate, and stacked-base outcomes. |
| 2026-08-13 | Recorded PR #420 as merged with the external-link-table design and advanced the active review target to PR #421.                                                                           |
