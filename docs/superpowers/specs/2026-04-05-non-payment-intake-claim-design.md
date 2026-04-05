# Non-Payment Intake Claim — Design Spec

**Date:** 2026-04-05
**Status:** Approved

---

## Problem

When a practice has a zero consultation fee (`shouldBypassPayment = true`), the intake is created immediately with `status: 'succeeded'` and no Stripe session. The existing `POST /claim` endpoint only accepts a `session_id`, so there is no path to link a non-payment intake to an authenticated user account. As a result, no client record is ever created for non-payment intakes.

---

## Solution

Add `POST /api/practice-client-intakes/{uuid}/claim` — a RESTful endpoint that claims a specific intake by its UUID, mirroring the payment claim flow but skipping the Stripe session lookup.

The existing `POST /claim` endpoint is untouched.

---

## API Contract

### `POST /api/practice-client-intakes/{uuid}/claim`

- **Auth:** Required (authenticated session)
- **Path param:** `uuid` — the intake UUID
- **Request body:** Empty
- **Response `200`:**
  ```json
  { "success": true, "data": { "intake_uuid": "...", "organization_id": "..." } }
  ```
- **Error responses:**
  | Status | Condition |
  |--------|-----------|
  | `400` | Intake status is not `succeeded` (still `open`, awaiting payment) |
  | `403` | Intake already claimed by a different user |
  | `404` | Intake not found |
  | `409` | Client record already exists (treated as success on frontend) |

---

## Backend Changes

All changes are in `src/modules/practice-client-intakes/`.

### `services/intake-checkout.service.ts`

Add `claimIntakeByUuid(params: { intakeUuid: string }, ctx: ServiceContext)`:
- Look up intake via `practiceClientIntakesRepository.findById(params.intakeUuid)`
- Return `404` if not found
- Delegate to existing `processClaimIntakeTx` — no duplication of claiming logic
- Same error handling pattern as existing `claimIntake`

Export from `intakeCheckoutService`.

### `routes/client.routes.ts`

Add `claimPracticeClientIntakeByUuidRoute`:
- `POST /{uuid}/claim`
- Param: `uuidParamOpenAPISchema` (already exists)
- No request body
- Responses: `200` (`claimPracticeClientIntakeResponseSchema`), `400`, `403`, `404`, `500`

### `handlers.ts`

Add `claimPracticeClientIntakeByUuidHandler`:
- Extract `uuid` from path params
- Call `intakeCheckoutService.claimIntakeByUuid({ intakeUuid: uuid }, ctx)`
- Return `sendResult(c, result, 200)`

### `http.ts`

Register `claimPracticeClientIntakeByUuidRoute` in the dynamic routes section (after the existing static `/claim` route, alongside other `/{uuid}/...` routes).

---

## Frontend Changes

Both changes are in `/Users/giteshkhurani/Projects/blawby-ai-chatbot`.

### `src/features/intake/api/intakesApi.ts`

Add `claimIntakeByUuid(intakeUuid: string)`:
- `POST /api/practice-client-intakes/{intakeUuid}/claim`
- Empty body, `credentials: 'include'`
- Returns `{ intake_uuid, organization_id }` — same shape as `claimIntakePayment`

### `src/shared/hooks/useIntakeFlow.ts`

In the `!paymentLinkUrl` branch (non-payment success, ~line 833), after posting the confirmation message:
- If user is **authenticated** (not anonymous): call `claimIntakeByUuid(intakeUuid)`
- Handle `409` gracefully — already claimed, treat as success
- Dispatch `auth:session-updated` event on success (same as `PaySuccessPage` does for payment claims)
- If user is **anonymous**: no claim — same behaviour as the payment anonymous path ("sign in to continue")

---

## Flow Comparison

| Step | Payment flow | Non-payment flow |
|------|-------------|-----------------|
| Intake created | `status: 'open'` | `status: 'succeeded'` |
| Stripe checkout | Yes | **Skipped** |
| Success trigger | `PaySuccessPage` redirect | Inline after `submit-intake` |
| Claim endpoint | `POST /claim` with `session_id` | `POST /{uuid}/claim` (new) |
| Anonymous behaviour | "Sign in to continue" | Same — no claim |
| Client record created | Yes, via `createClientFromIntake` | Yes, same path |

---

## What Is Not Changing

- `POST /claim` (payment path) — untouched
- `processClaimIntakeTx` — reused as-is, no changes
- `createClientFromIntake` — reused as-is
- Anonymous user handling — no new behaviour introduced
