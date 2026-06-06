# Test Suite: Practices, Engagement Contracts & Intakes

**Date:** 2026-05-22
**Status:** Approved

## Problem

No test coverage exists for the practice, engagement-contracts, or practice-client-intakes modules. The one critical business flow — intake submission → client conversion → engagement contract signed — has no integration-level verification. Module bugs and cross-module regressions are caught only in production.

## Goals

- Basic coverage (happy path + auth checks + key error cases) for practice CRUD, engagement contract CRUD + lifecycle, and intakes (public + staff routes)
- Cross-module regression coverage for the intake→client→contract chain
- All tests run against a real PostgreSQL database (`blawby_test`) — no mocking of the DB layer

## Non-Goals

- Intake client routes (checkout-session, update, get status) — deferred
- Stripe webhook integration tests — deferred
- File upload / presign tests — deferred
- Performance or load testing

## Test Structure

```
test/
  modules/
    practice/
      practice.test.ts              # new
    engagement-contracts/
      engagement-contracts.test.ts  # new
    practice-client-intakes/
      intakes.test.ts               # extend existing
  flows/
    intake-to-client.test.ts        # new
    intake-to-contract.test.ts      # new
```

## Module Tests

### `practice.test.ts`

| Scenario | Expected |
|---|---|
| GET /list — authenticated owner | 200 + array |
| POST / — create practice | 201 + practice record |
| GET /{practice_id} — owner | 200 + practice record |
| PUT /{practice_id} — update name | 200 + updated record |
| DELETE /{practice_id} — owner | 204 |
| GET /{practice_id} — unauthenticated | 401 |
| GET /{practice_id} — wrong org member | 403 |
| GET /{practice_id} — non-existent ID | 404 |

### `engagement-contracts.test.ts`

| Scenario | Expected |
|---|---|
| POST /{practice_id} — create draft | 201 + contract in `draft` status |
| GET /{practice_id} — list | 200 + `{ data: [...] }` |
| GET /{practice_id}/{contract_id} — get | 200 + contract |
| PATCH /{practice_id}/{contract_id} — update draft | 200 + updated contract |
| PATCH status — draft → sent | 200 + `sent` status |
| PATCH status — sent → accepted | 200 + `accepted` status |
| PATCH status — sent → declined | 200 + `declined` status |
| PATCH status — invalid transition (accepted → sent) | 4xx |
| POST — unauthenticated | 401 |
| POST — wrong org | 403 |
| GET — non-existent contract | 404 |

### `intakes.test.ts` (extend existing)

Extend with any missing staff route coverage:

| Scenario | Expected |
|---|---|
| GET /{practice_id} — list intakes as staff | 200 + paginated list |
| GET /{practice_id}/{id} — get intake as staff | 200 + intake record |
| PATCH /{uuid}/status — accept | 200 + `accepted` status |
| PATCH /{uuid}/status — reject | 200 + `rejected` status |
| PATCH /{uuid}/convert — convert to client | 200 + client record |

## Flow Tests

### `intake-to-client.test.ts`

Verifies the handoff between intakes and clients modules:

1. Submit intake via public `POST /create`
2. Staff accepts via `PATCH /{uuid}/status` (`accept`)
3. Staff converts via `PATCH /{uuid}/convert`
4. Assert resulting client record has correct `organization_id`, `email`, `name`
5. Assert intake status is `converted`

### `intake-to-contract.test.ts`

Verifies the full intake → contract chain:

1. Submit intake → accept → convert (reuse intake-to-client steps)
2. Create engagement contract `POST /{practice_id}` using the new client ID
3. Send contract `PATCH status` → `sent`
4. Accept contract `PATCH status` → `accepted`
5. Assert contract has correct `client_id`, `status: accepted`

## External Dependencies to Mock

- **Stripe** — mock `stripe-client` in any test touching checkout or payment links (same pattern as existing `intakes.test.ts`)
- **Email** — mock Resend/email service in engagement contract tests (contract sent/accepted trigger emails)
- **PDF generation** — mock `engagement-contract-pdf.service` in contract tests

## Setup Pattern

Use existing helpers throughout:

- `authHelpers.createTestContext(role)` — creates user + org + session token
- `authenticatedRequest(sessionToken)` — supertest with cookie auth
- `createRequest(app.fetch)` — unauthenticated requests for public routes
- Mount isolated module Hono app per test file (same pattern as `intakes.test.ts`) for module tests
- Flow tests use the full `app` from `test/helpers/app.ts` to exercise real middleware chain

## Success Criteria

- All 7 test files pass in CI on a fresh `blawby_test` database
- No real Stripe, email, or PDF calls made during test runs
- Each module test file runs in under 10 seconds
- Flow tests run in under 30 seconds each
