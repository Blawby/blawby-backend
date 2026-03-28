# Practice Client Intakes Module

## What This Module Does (Plain English)

When someone visits a law firm's intake form online, they fill in their details (name, email, case description, etc.) and optionally pay a consultation fee. That's what this module manages.

**The full journey looks like this:**

1. **Client fills out the form** → intake record is created in the DB
2. **Client pays (if required)** → redirected to Stripe, payment confirmed via webhook
3. **Client claims their intake** → they sign up / log in and the intake is linked to their account
4. **Lawyer reviews the intake** → accepts or declines it (triage)
5. **If accepted** → intake gets converted into a formal matter (case)

The module also handles the case where a client started as an anonymous user (e.g., chatted with the AI bot before signing up) and then created a full account — it tracks that linkage so conversations and intakes from the anonymous session can be reconnected to the real account.

---

## Status

✅ **APIs are operational** — All endpoints are registered and functional. Mounted at `/api/practice/client-intakes`.

---

## Endpoint Overview

The module has three sets of endpoints based on who is calling:

| Who                                    | What they can do                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Public** (anyone)                    | Get intake form settings, create intake, check post-pay status                                  |
| **Client** (authenticated client)      | Update intake, check intake status, create checkout session, claim intake                       |
| **Staff** (authenticated lawyer/admin) | List intakes, get intake detail, triage (accept/decline), convert to matter, trigger invitation |

---

## Public Endpoints

### GET `/:slug/intake`

Loads the intake form for a practice. Returns practice branding, settings, and whether payment is required.

**Example response:**

```json
{
  "success": true,
  "data": {
    "practice": { "id": "uuid", "name": "Smith & Co", "slug": "smith-co", "logo": "https://..." },
    "settings": { "payment_link_enabled": true, "prefill_amount": 5000 },
    "connectedAccount": { "id": "uuid", "chargesEnabled": true }
  }
}
```

**Errors:** `404` if practice not found, payment links disabled, or Stripe not ready.

---

### POST `/create`

Creates a new intake. If payment is required, also creates a Stripe Payment Link. The frontend should redirect the client to that link.

**Request body:**

```json
{
  "slug": "smith-co",
  "amount": 5000,
  "email": "client@example.com",
  "name": "Jane Doe",
  "phone": "+1234567890",
  "description": "Employment dispute",
  "on_behalf_of": "My son",
  "opposing_party": "ABC Corp",
  "conversation_id": "uuid (optional — from AI chat session)"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "uuid": "uuid",
    "payment_link_url": "https://buy.stripe.com/xxx",
    "amount": 5000,
    "currency": "usd",
    "status": "open",
    "practice": { "name": "Smith & Co", "logo": "https://..." }
  }
}
```

If `payment_link_url` is `null` and `status` is `succeeded`, no payment is needed — intake was created directly.

> **`conversation_id` field**: When a client first interacts through the AI chatbot as an anonymous user, that chat session has a `conversation_id`. Passing it here links the intake to that conversation, so when the client later signs up and the practice accepts the intake, both sides (practice + client) can be added to the same conversation thread.

---

### GET `/post-pay-status?session_id=...`

Called after Stripe redirects the client back. Checks whether the Stripe Checkout Session succeeded and returns the intake UUID.

---

## Client Endpoints (Authenticated)

### POST `/:uuid/checkout-session`

Creates a Stripe Checkout Session for an existing intake (used when payment wasn't set up at creation time).

---

### PUT `/:uuid`

Updates intake fields (e.g., amount). Only works if payment hasn't been completed yet.

---

### GET `/:uuid/status`

Returns the current intake status + all metadata. Frontend polls this while waiting for payment confirmation.

**Status values:**

- `open` — awaiting payment
- `succeeded` — payment complete (or no payment needed)
- `expired` — payment link expired
- `canceled` — payment canceled
- `failed` — payment failed
- `converted` — intake has been turned into a matter

---

### POST `/claim`

After payment, the client signs up or logs in. This endpoint links the intake to their authenticated user account and adds them as a member of the practice's organization.

**Request body:**

```json
{ "session_id": "stripe_checkout_session_id" }
```

If the user was previously anonymous (e.g., from the AI chatbot), this is where the identity upgrade happens — the anonymous user ID is linked to the new registered user ID via the `identity_upgrade_claims` table.

---

## Staff Endpoints (Authenticated — Lawyers / Admins)

### GET `/:practice_id`

Lists all intakes for a practice with pagination, filtering by status, date range, etc.

---

### GET `/:practice_id/:id`

Gets full detail of a single intake.

---

### PATCH `/:uuid/status` — Triage (Accept / Decline)

This is the accept/deny button in the practice dashboard.

**Request body:**

```json
{
  "status": "accepted",
  "reason": "optional decline reason"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "uuid": "uuid",
    "conversation_id": "uuid or null",
    "triage_status": "accepted",
    "triage_reason": null,
    "triage_decided_at": "2026-03-21T10:00:00Z"
  }
}
```

The `conversation_id` in the response tells the frontend which conversation thread to open or link — this is how the chat between the AI bot (where the client first described their problem) gets connected to the practice's inbox.

---

### PATCH `/:uuid/convert`

Converts an accepted intake into a formal matter (case). Creates the matter record with all the intake data pre-filled.

**Request body:**

```json
{
  "title": "Employment Dispute — Jane Doe",
  "billing_type": "fixed",
  "status": "engagement_pending",
  "responsible_attorney_id": "uuid",
  "practice_service_id": "uuid",
  "open_date": "2026-03-21"
}
```

---

### POST `/:uuid/invite`

Manually triggers an invitation email to the client associated with a completed intake (to invite them to join the practice's portal).

---

## Data Model

### Table: `practice_client_intakes`

| Column                      | Type      | Notes                                                      |
| --------------------------- | --------- | ---------------------------------------------------------- |
| `id`                        | uuid      | Primary key                                                |
| `organization_id`           | uuid      | FK → organizations                                         |
| `connected_account_id`      | uuid      | FK → stripe_connected_accounts                             |
| `conversation_id`           | uuid      | FK → conversations (nullable) — links to AI chat           |
| `stripe_payment_link_id`    | text      | Stripe Payment Link ID                                     |
| `stripe_payment_intent_id`  | text      | Populated via webhook                                      |
| `stripe_charge_id`          | text      | Populated via webhook                                      |
| `amount`                    | integer   | In cents                                                   |
| `currency`                  | text      | Default: `usd`                                             |
| `status`                    | text      | open / succeeded / expired / canceled / failed / converted |
| `triage_status`             | text      | pending_review / accepted / declined                       |
| `triage_reason`             | text      | Reason for decline (nullable)                              |
| `triage_decided_at`         | timestamp | When lawyer made the decision                              |
| `metadata`                  | jsonb     | Client info: name, email, phone, description, etc.         |
| `client_ip`                 | text      | For audit/security                                         |
| `user_agent`                | text      | For audit/security                                         |
| `succeeded_at`              | timestamp | When payment was confirmed                                 |
| `created_at` / `updated_at` | timestamp | Standard timestamps                                        |

---

## How Identity Upgrade Works (Anonymous → Registered User)

```
Client chats with AI bot (anonymous session)
    ↓
Client decides to hire the lawyer and submits intake form
    → intake is created with conversation_id from the chat
    ↓
Client pays via Stripe and gets redirected back
    ↓
Client signs up / logs in (POST /claim)
    → identity_upgrade_claims record created: { anon_user_id, registered_user_id }
    → session updated with previous_anon_user_id
    → client added to practice as member
    ↓
Lawyer accepts the intake (PATCH /:uuid/status)
    → response includes conversation_id
    → frontend uses it to link both parties into the same conversation
```

This solves the race condition where a client submits an intake, pays, and then creates an account — we need to know which anonymous session was theirs so we don't lose their chat history.

---

## Payment + Webhook Flow

```
1. POST /create → Stripe Payment Link created
2. Client redirected to Stripe hosted payment page
3. Client pays → Stripe sends webhook to /api/webhooks/stripe
4. Webhook handler:
   - Finds intake by payment intent / payment link ID
   - Updates status to "succeeded"
   - Stores stripePaymentIntentId, stripeChargeId, succeededAt
   - Publishes IntakePaymentSucceeded event
5. Client returns from Stripe → frontend polls GET /:uuid/status
6. Once succeeded, frontend calls POST /claim to link account
```

---

## Events Published

| Event                    | When                            |
| ------------------------ | ------------------------------- |
| `IntakePaymentCreated`   | Intake created via POST /create |
| `IntakePaymentSucceeded` | Stripe payment confirmed        |
| `IntakePaymentFailed`    | Stripe payment failed           |
| `IntakePaymentCanceled`  | Stripe payment canceled         |

---

## Services

| Service                       | Responsibility                                              |
| ----------------------------- | ----------------------------------------------------------- |
| `intake-creation.service.ts`  | Creating and updating intakes, loading settings             |
| `intake-checkout.service.ts`  | Checkout session creation, post-pay status, claiming intake |
| `intake-lifecycle.service.ts` | Listing, triaging, converting intakes                       |
| `intake-access.helpers.ts`    | CASL permission checks for staff vs. client access          |
| `intake-shared.helpers.ts`    | Formatters, parsers, shared utilities                       |
| `intake-stripe.helpers.ts`    | Stripe-specific helpers                                     |

---

## Dependencies

- **Stripe API** — Payment Link and Checkout Session creation
- **Practices Module** — Practice lookup and settings
- **Matters Module** — Creates matter on conversion
- **User Details Module** — Links client user ID on claim
- **Better Auth** — Session and identity management
- **Webhooks Module** — Stripe event routing
- **Events System** — Payment lifecycle events

---

## Security Notes

- Public endpoints (form settings, create, post-pay status) require no auth — rate limiting should be applied at the infra level
- Client endpoints require authentication; intakes are scoped to the authenticated user
- Staff endpoints require authentication + organization membership + CASL `update` permission on intakes
- All inputs validated via Zod schemas
- Client IP and user agent stored for audit purposes
