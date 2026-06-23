# Blawby — Product Roadmap

> Purpose: product direction and migration sequencing.
>
> Not purpose: executable task tracker. Use [`docs/PRIORITY.md`](./docs/PRIORITY.md) and GitHub issues for current engineering execution.
>
> Last verified against code/issues: 2026-06-18.

## How To Use This File

Roadmap entries are leads until verified. Before implementing, closing, or re-prioritizing an item here, check the current code, tests, config, and GitHub issue state. If the implementation already exists, update this file instead of redoing the work.

Evidence checked for this version:

| Area | Current evidence |
|---|---|
| Intake conversations in PostgreSQL | `src/modules/intake-conversations/**`, `src/schema/index.ts`, closed [#308](https://github.com/Blawby/blawby-backend/issues/308) |
| Engagement templates table/API | `src/modules/engagement-templates/**`, closed [#313](https://github.com/Blawby/blawby-backend/issues/313), closed PR [#314](https://github.com/Blawby/blawby-backend/pull/314) |
| Structured intake triage fields | `src/modules/practice-client-intakes/database/schema/practice-client-intakes.schema.ts`, closed [#89](https://github.com/Blawby/blawby-backend/issues/89), closed [#98](https://github.com/Blawby/blawby-backend/issues/98) |
| Expanded MCP CRUD surface | `src/modules/mcp/mcp.tools.generated.ts`, `test/modules/mcp/tool-registry.test.ts`, closed [#320](https://github.com/Blawby/blawby-backend/issues/320) |
| Practice AI skills | Open [#316](https://github.com/Blawby/blawby-backend/issues/316) |
| Practice-level AI provider | Open [#292](https://github.com/Blawby/blawby-backend/issues/292) |
| UoW and test stabilization | Open [#342](https://github.com/Blawby/blawby-backend/issues/342), open [#337](https://github.com/Blawby/blawby-backend/issues/337) |

## Current Readiness Gate

Before starting another large product migration, finish the stabilization work that affects reliability across billing, events, and background jobs.

| Priority | Gate | Tracker | Why it comes first |
|---|---|---|---|
| 1 | Complete remaining Unit of Work cleanup | [#342](https://github.com/Blawby/blawby-backend/issues/342) | Removes the remaining transaction/event footguns before adding more cross-module flows. |
| 2 | Improve real database integration test harness | [#337](https://github.com/Blawby/blawby-backend/issues/337) | Billing, trust, subscriptions, events, and intake conversion need real DB confidence. |
| 3 | Add targeted regression coverage for touched transaction/event paths | Follow-up from #342/#337 | Prevents new automation from locking in old transaction patterns. |

## Verified Product Status

### Completed Or Mostly Completed

| Area | Status | Evidence | Notes |
|---|---|---|---|
| Intake conversations → PostgreSQL | Backend complete | `src/modules/intake-conversations/**`; [#308](https://github.com/Blawby/blawby-backend/issues/308) closed completed | The implemented module is named `intake-conversations`, mounted at `/api/intake-conversations`, not generic `/api/conversations`. Worker write-through status lives outside this repo and should be verified in the worker repo before removing any fallback. |
| Engagement templates → table/API | Complete | `src/modules/engagement-templates/**`; [#313](https://github.com/Blawby/blawby-backend/issues/313); PR [#314](https://github.com/Blawby/blawby-backend/pull/314) | CRUD, schema, versioning, publication fields, and MCP route annotations exist. Do not describe this as future work. |
| Intake AI-collected triage fields | Partially complete | `practice_client_intakes` has `urgency`, `desired_outcome`, `court_date`, `has_documents`, `income`, `household_size`, `case_strength`, transcript/jurisdiction fields; [#89](https://github.com/Blawby/blawby-backend/issues/89), [#98](https://github.com/Blawby/blawby-backend/issues/98) closed | The durable fields exist. A backend AI enrichment job does not appear to exist yet. |
| MCP CRUD expansion and write safety | Mostly complete | Generated registry includes many modules; MCP tests cover scope enforcement and approval; [#320](https://github.com/Blawby/blawby-backend/issues/320) closed | Practice AI skills remain separate and open in #316. |
| Engagement contract PDF/signature flow | Mostly complete | `src/modules/engagement-contracts/services/engagement-contract.service.ts`, `engagement-contract-pdf.service.ts`, closed PR [#235](https://github.com/Blawby/blawby-backend/pull/235) | The older roadmap gap "PDF generation of signed letter" is no longer accurate as a blank feature gap. Any remaining e-signature/audit hardening needs a fresh issue with current evidence. |
| Shared uploads/R2 infrastructure | Complete enough for backend ownership | `src/shared/uploads/**`, `src/modules/matters/services/matter-files.service.ts`, `src/modules/practice-client-intakes/services/intake-files.service.ts` | Presigned upload/download URLs are backend-owned now. Do not say presign generation must stay in the Worker. |

### Open Product Work

| Area | Status | Tracker | Next useful action |
|---|---|---|---|
| Practice AI skills | Open | [#316](https://github.com/Blawby/blawby-backend/issues/316) | Implement skill registry, enabled skills storage, deterministic prompt builder, and MCP/chatbot parity. |
| Practice-level AI provider | Open | [#292](https://github.com/Blawby/blawby-backend/issues/292) | Decide whether provider selection is practice config, subscription entitlement, or both. |
| Backend intake enrichment job | Open | [#344](https://github.com/Blawby/blawby-backend/issues/344) | Add Graphile Worker enrichment without recreating existing intake schema work. |
| Engagement AI generation backend service | Open | [#345](https://github.com/Blawby/blawby-backend/issues/345) | Move draft generation behind backend-owned template/intake/matter/practice context. |
| Billing automation | Needs issue | Old broad billing issue [#122](https://github.com/Blawby/blawby-backend/issues/122) is closed | Split into smaller verified issues: milestone auto-invoice, threshold auto-invoice, trust draw automation, retainer replenishment, saved payment method charging. |
| Reporting and analytics | Needs issue | No current open issue linked here | Define report contracts after test harness and billing/trust invariants are stable. |
| Client payment portal | Needs issue | No current open issue linked here | Verify current invoice link/client endpoints first, then write a focused portal issue. |
| Deadline reminders | Needs issue | Deadline CRUD exists in matters | Create a job/event issue for reminder scheduling, notification preferences, and idempotency. |

## Product Sequence

This is the recommended product order after the stabilization gate. Each row should become or point to a verified GitHub issue before implementation.

| Order | Work | Why this order |
|---|---|---|
| 0 | UoW cleanup + DB test harness | Reliability first. This protects every cross-module workflow below. |
| 1 | Practice AI skills + provider config | Open issues already exist; this unlocks consistent AI behavior across MCP and chatbot surfaces. |
| 2 | Backend intake enrichment job | Durable fields exist; the missing piece is backend-owned enrichment, versioning, and retry. |
| 3 | Engagement AI generation service | Engagement templates are now first-class data, so draft generation can be backend-owned instead of request-body-only. |
| 4 | Billing automation slices | Invoice/trust foundations exist, but automation should be split into small, testable flows. |
| 5 | Client payment portal | Builds on invoice delivery/payment flows after automation rules are clear. |
| 6 | Reporting and practice operations | Use stabilized billing, matters, intakes, and conversations data. |
| 7 | Higher-level AI intelligence | MCP CRUD exists; build composite intelligence only after skills/provider/enrichment are in place. |

## Worker Boundary

The Worker should keep responsibilities that are genuinely edge-appropriate. Backend should own durable business state and auditable decisions.

| Responsibility | Owner | Current guidance |
|---|---|---|
| Real-time chat streaming | Worker | Keep Durable Objects/WebSocket/SSE at the edge. |
| Presence and typing indicators | Worker | Latency-sensitive fan-out belongs at the edge. |
| Anonymous public chatbot UI/routing | Worker/frontend | Edge performance matters for conversion. |
| Durable conversation records | Backend | Intake conversation records and messages now exist in PostgreSQL. Verify worker write-through before removing D1 fallback. |
| File upload metadata and presigned URLs | Backend | Shared uploads service owns R2/Image presign, confirm, metadata, download, and audit behavior. |
| R2 object storage/CDN delivery | Cloudflare/R2 | Store and deliver bytes through Cloudflare primitives; do not proxy large files through app handlers. |
| AI enrichment decisions that affect practice workflows | Backend | Use Graphile Worker jobs and durable fields for retryable, auditable decisions. |

## Area Notes

### Conversations

The old roadmap item "Conversations → PostgreSQL" is no longer future work in this backend. Current implementation is intake-specific:

- tables: `intake_conversations`, `intake_conversation_messages`
- module: `src/modules/intake-conversations`
- mount: `/api/intake-conversations`
- intake FK: `practice_client_intakes.conversation_id -> intake_conversations.id`

Before changing this area, verify the worker repo write-through state and whether product needs a broader non-intake conversation module.

### Engagement And Templates

Engagement templates are first-class backend resources. Engagement contracts already create signed PDF artifacts and upload them to R2 on acceptance.

Remaining roadmap work should focus on verified gaps:

- backend-owned AI draft generation using template + intake + matter/practice context
- any e-signature hardening beyond current signed PDF flow
- audit requirements for legal enforceability, if the current flow is insufficient

### Intake Enrichment

The backend already persists many AI-collected intake fields. Do not recreate that schema work.

The remaining useful work is a backend job that can:

- enqueue on intake submission or conversation update
- call the configured AI provider
- update existing durable fields and any new `ai_summary`/`enriched_at`/version fields if still needed
- preserve retry/idempotency semantics
- expose enough state for staff triage

### MCP And AI

MCP CRUD exposure and safety mechanisms are no longer a blank slate. Generated MCP tools exist and tests cover core safety behavior.

Open AI work is now more specific:

- [#316](https://github.com/Blawby/blawby-backend/issues/316): practice AI skills and deterministic prompt assembly
- [#292](https://github.com/Blawby/blawby-backend/issues/292): practice-level AI provider configuration

Avoid adding "smart" composite tools until those foundations are done.

### Billing And Trust Automation

Invoice delivery, payment processing, trust routing, refund handling, retainer balance tracking, and low-balance events all have current code. The roadmap should not imply the billing stack is absent.

Future automation should be split into verified issues:

- milestone completion auto-invoice
- unbilled time threshold auto-invoice
- retainer low-balance notification/replenishment
- trust-to-operating transfer automation on invoice approval/payment
- saved payment method charge flows

Each issue must cite the current invoice/trust/matter code it reuses.

## Decision Log

| Decision | Rationale |
|---|---|
| Keep Worker for real-time interaction, not durable business truth | Durable business records need PostgreSQL, auditing, tests, and backend authorization. |
| Treat roadmap items as leads until verified | Several roadmap items have already shipped; stale roadmap text caused wasted triage. |
| Stabilize UoW/tests before large product migrations | Cross-module automation in legal billing and intake flows is risky without reliable transaction and integration-test foundations. |
| Prefer skills/provider/enrichment foundations before higher-level AI | AI behavior should be deterministic, practice-configured, and backed by durable data before adding composite intelligence features. |
