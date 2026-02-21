# Practice Client Intakes Module

## Status

✅ **APIs are operational** - All endpoints are registered and functional. The module is mounted at `/api/practice/client-intakes`.

## Purpose and Boundaries

The Practice Client Intakes module handles intake creation plus optional payment flow. It enables law practices to collect client intake information and, when required by organization settings, collect payment through Stripe connected accounts.

**Boundaries:**
- Handles payment intent creation, updates, and status tracking
- Manages client intake metadata (contact info, case details)
- Integrates with Stripe Connected Accounts when payment is required
- Publishes events for payment lifecycle (succeeded, failed, canceled)
- **Does NOT handle**: practice management or client relationship management

## Routes/Endpoints

The module is mounted at `/api/practice/client-intakes`.

### 1. GET `/:slug/intake`
**Public endpoint** - Retrieves practice details and payment settings for a practice's intake form.

**Full Path:** `/api/practice/client-intakes/:slug/intake`

**Path Parameters:**
- `slug` (string, required): Practice slug (e.g., `my-practice`)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "practice": {
      "id": "uuid",
      "name": "Law Firm Name",
      "slug": "my-practice",
      "logo": "https://..."
    },
    "settings": {
      "payment_link_enabled": true,
      "prefill_amount": 5000
    },
    "connectedAccount": {
      "id": "uuid",
      "chargesEnabled": true
    }
  }
}
```

**Error Responses:**
- `404 Not Found`: Practice not found, payment links disabled, or connected account not ready

**Use Case:** Frontend calls this to display the intake form with practice branding and pre-filled payment amount.

---

### 2. POST `/create`
Creates a practice client intake. Stripe checkout is created only when payment is required by organization settings.

**Request Body:**
```json
{
  "slug": "my-practice",
  "amount": 5000,
  "email": "client@example.com",
  "name": "John Doe",
  "phone": "+1234567890",
  "on_behalf_of": "Jane Doe",
  "opposing_party": "ABC Corp",
  "description": "Initial consultation for employment dispute"
}
```

**Field Validation:**
- `slug`: string, 1-100 chars
- `amount`: integer, 0-99999999 (cents)
- `email`: valid email, max 255 chars
- `name`: string, 1-200 chars
- `phone`: string, max 50 chars (optional)
- `on_behalf_of`: string, max 200 chars (optional)
- `opposing_party`: string, max 200 chars (optional)
- `description`: string, max 500 chars (optional)

**Amount limits:** `0` to `99,999,999` cents. Use `0` when payment is not required by organization settings.

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "uuid": "123e4567-e89b-12d3-a456-426614174000",
    "payment_link_url": "https://buy.stripe.com/xxx",
    "amount": 5000,
    "currency": "usd",
    "status": "open",
    "practice": {
      "name": "Law Firm Name",
      "logo": "https://..."
    }
  }
}
```

**Error Responses:**
- `400 Bad Request`: Validation failed or payment link creation error
- `500 Internal Server Error`: Stripe API error or database error

**Use Case:** Frontend calls this when client submits the intake form. If `payment_link_url` is present and `status` is `open`, redirect to Stripe. If `payment_link_url` is `null`, do not redirect; the intake is created with `status: "succeeded"` because payment is not required.

---

### 3. PUT `/:uuid`
Updates intake fields, including payment amount.

**Path Parameters:**
- `uuid` (UUID, required): Practice client intake UUID from create response

**Request Body:**
```json
{
  "amount": 7500
}
```

**Field Validation:**
- `amount`: integer, 0-99999999 (cents)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "uuid": "123e4567-e89b-12d3-a456-426614174000",
    "payment_link_url": "https://buy.stripe.com/yyy",
    "amount": 7500,
    "currency": "usd",
    "status": "open"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Validation failed, payment already completed/expired, or update failed
- `404 Not Found`: Intake not found
- `500 Internal Server Error`: Stripe API error

**Use Case:** Frontend calls this to update intake fields after creation.

---

### 4. GET `/:uuid/status`
Retrieves the current status of a practice client intake.

**Path Parameters:**
- `uuid` (UUID, required): Practice client intake UUID from create response

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "uuid": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 5000,
    "currency": "usd",
    "status": "succeeded",
    "stripe_charge_id": "ch_xxx",
    "metadata": {
      "email": "client@example.com",
      "name": "John Doe",
      "phone": "+1234567890",
      "on_behalf_of": "Jane Doe",
      "opposing_party": "ABC Corp",
      "description": "Initial consultation"
    },
    "succeeded_at": "2024-01-15T10:30:00Z",
    "created_at": "2024-01-15T10:25:00Z"
  }
}
```

**Status Values:**
- `open`: awaiting payment
- `succeeded`: payment completed or intake succeeded directly
- `expired`: payment expired
- `canceled`: payment canceled
- `failed`: payment failed
- `converted`: converted to matter

**Error Responses:**
- `404 Not Found`: Intake not found
- `500 Internal Server Error`: Database error

**Use Case:** Frontend polls this endpoint for intake/payment progression and final state.

---

## Data Model

### Table: `practice_client_intakes`

**Schema:**
```typescript
{
  id: uuid (primary key)
  practice_id: uuid (foreign key → practices.id, cascade delete)
  connected_account_id: uuid (foreign key → stripe_connected_accounts.id, restrict delete)
  
  // Stripe IDs
  stripe_payment_link_id: text (unique, not null) // Stripe Payment Link ID
  stripe_payment_intent_id: text (nullable) // Created by Payment Link, populated via webhook
  stripe_charge_id: text (nullable)
  
  // Payment Details
  amount: integer (cents, not null)
  application_fee: integer (cents, nullable)
  currency: text (default: 'usd', not null)
  status: text (not null)
  
  // Client Data
  metadata: jsonb {
    email: string
    name: string
    phone?: string
    on_behalf_of?: string
    opposing_party?: string
    description?: string
  }
  
  // Security & Tracking
  client_ip: text (nullable)
  user_agent: text (nullable)
  
  // Timestamps
  succeeded_at: timestamp (nullable)
  created_at: timestamp (default: now, not null)
  updated_at: timestamp (default: now, not null)
}
```

**Indexes:**
- `practice_id` (for querying by practice)
- `stripe_payment_link_id` (unique, for Payment Link lookups)
- `stripe_payment_intent_id` (for Stripe webhook lookups)
- `status` (for filtering by payment status)

**Relations:**
- `practice` → `practices` table (many-to-one)
- `connectedAccount` → `stripe_connected_accounts` table (many-to-one)

### Repository

**Location:** `database/queries/practice-client-intakes.repository.ts`

**Key Methods:**
- `create(intake: InsertPracticeClientIntake)`: Creates new intake record
- `findByUuid(uuid: string)`: Finds intake by UUID
- `findByStripePaymentLinkId(paymentLinkId: string)`: Finds intake by Stripe Payment Link ID
- `findByStripePaymentIntentId(paymentIntentId: string)`: Finds intake by Stripe payment intent ID (for webhooks)
- `update(id: string, data: Partial<SelectPracticeClientIntake>)`: Updates intake record
- `updateStatus(id: string, status: string)`: Updates payment status

---

## Services and Key Business Logic

**Location:** `services/practice-client-intakes.service.ts`

### Service Methods

#### `getPracticeClientIntakeSettings(slug: string)`
1. Finds practice by slug
2. Validates `paymentLinkEnabled` is true
3. Retrieves connected Stripe account
4. Validates `chargesEnabled` is true
5. Returns practice details, settings, and connected account info

#### `createPracticeClientIntake(request)`
1. Validates practice exists and payment links enabled
2. Retrieves connected account
3. Creates Stripe Payment Link with:
   - Line item with amount and currency
   - Payment intent data with transfer to connected account
   - Metadata (client info, practice ID, intake UUID)
   - Redirect URL after completion
4. Creates database record with Payment Link ID
5. Updates Payment Link metadata with intake UUID
6. Publishes `PRACTICE_CLIENT_INTAKE_CREATED` event
7. Returns UUID and Payment Link URL for frontend redirect

#### `updatePracticeClientIntake(uuid: string, amount: number)`
1. Finds intake by UUID
2. Validates status allows updates (not `completed` or `expired`)
3. Deactivates old Payment Link
4. Creates new Payment Link with updated amount
5. Updates database record with new Payment Link ID
6. Returns new Payment Link URL

#### `getPracticeClientIntakeStatus(uuid: string)`
1. Finds intake by UUID
2. Returns current status, metadata, and timestamps

### Event Handlers

**Location:** `handlers/`

The module listens to Stripe webhook events via the webhooks module. All handlers use object parameters for explicit naming and share a common helper for finding intakes by Payment Intent.

**Helper Function (`helpers.ts`):**
- `findPracticeClientIntakeByPaymentIntent(paymentIntent)`: Finds intake by Payment Intent ID or Payment Link ID (since Payment Links create Payment Intents)

- **`succeeded.ts`**: Handles `payment_intent.succeeded`
  - **Signature:** `handlePracticeClientIntakeSucceeded({ paymentIntent, eventId? })`
  - Updates intake status to `succeeded`
  - Stores `stripePaymentIntentId`, `stripeChargeId`, and `succeededAt`
  - Publishes `INTAKE_PAYMENT_SUCCEEDED` event with:
    - `event_id`: Stripe webhook event ID (if provided)
    - `stripe_payment_intent_id`: Stripe Payment Intent ID
    - `intake_payment_id`: Database intake UUID
    - `uuid`: Intake UUID
    - `amount`, `currency`: Payment details
    - `client_email`, `client_name`: Client information from metadata
    - `stripe_charge_id`: Stripe Charge ID
    - `succeeded_at`: ISO timestamp

- **`failed.ts`**: Handles `payment_intent.payment_failed`
  - **Signature:** `handlePracticeClientIntakeFailed(paymentIntent)`
  - Updates intake status to `failed`
  - Stores `stripePaymentIntentId`
  - Publishes `INTAKE_PAYMENT_FAILED` event with:
    - `intake_payment_id`: Database intake UUID
    - `uuid`: Intake UUID
    - `amount`, `currency`: Payment details
    - `client_email`, `client_name`: Client information from metadata
    - `failure_reason`: Error message from Stripe
    - `failed_at`: ISO timestamp

- **`canceled.ts`**: Handles `payment_intent.canceled`
  - **Signature:** `handlePracticeClientIntakeCanceled(paymentIntent)`
  - Updates intake status to `canceled`
  - Stores `stripePaymentIntentId`
  - Publishes `INTAKE_PAYMENT_CANCELED` event with:
    - `intake_payment_id`: Database intake UUID
    - `uuid`: Intake UUID
    - `amount`, `currency`: Payment details
    - `client_email`, `client_name`: Client information from metadata
    - `canceled_at`: ISO timestamp

### Published Events

- **`EventType.PRACTICE_CLIENT_INTAKE_CREATED`**: Published when intake is created via `POST /create`
- **`EventType.INTAKE_PAYMENT_SUCCEEDED`**: Published when payment succeeds (includes `event_id` and `stripe_payment_intent_id`)
- **`EventType.INTAKE_PAYMENT_FAILED`**: Published when payment fails
- **`EventType.INTAKE_PAYMENT_CANCELED`**: Published when payment is canceled

**Note:** Event type names use `INTAKE_PAYMENT_*` prefix for consistency with the payments module.

---

## Required Environment Variables

- `STRIPE_SECRET_KEY`: Stripe secret key for API authentication
- `STRIPE_WEBHOOK_SECRET`: Webhook signing secret (for webhook verification in payments module)
- `DATABASE_URL`: PostgreSQL connection string

---

## Security and Compliance Considerations

### Authentication
- **All endpoints are public** - No authentication required
- Intake forms are meant to be accessible to anyone with the practice slug
- Rate limiting should be applied at the application level

### Data Protection
- **PII Storage**: Client email, name, phone stored in `metadata` JSONB field
- **IP Tracking**: Client IP and user agent stored for security/audit purposes
- **Data Retention**: Follow practice's data retention policy
- **GDPR Compliance**: Consider data export/deletion capabilities for client requests

### Payment Security
- **Stripe Integration**: All payment processing handled by Stripe
- **Client Secrets**: Never expose server-side Stripe keys to frontend
- **Webhook Verification**: Webhook events verified via Stripe signature (handled in webhooks module)
- **Idempotency**: Stripe Payment Intents are idempotent by design

### Access Controls
- **Practice Validation**: All operations validate practice exists and payment links enabled
- **Connected Account Validation**: Ensures connected account is ready (`chargesEnabled`)
- **Status Validation**: Update operations check status before allowing changes

### Audit Logging
- **Payment Lifecycle**: All status changes logged via database timestamps
- **Event Publishing**: Payment lifecycle events published for downstream processing
- **Error Tracking**: Service errors should be logged with context (practice ID, intake UUID)

### Rate Limiting
- Apply rate limiting to prevent abuse:
  - `/create`: Limit per IP to prevent spam
  - `/:uuid/status`: Limit polling frequency
  - Consider practice-level limits

### Input Validation
- All inputs validated via Zod schemas
- Amount limits: $0.50 - $999,999.99
- String length limits enforced
- Email format validation
- UUID format validation for path parameters

---

## Integration Points

### Dependencies
- **Stripe API**: Payment processing via Stripe Connected Accounts
- **Practices Module**: Practice lookup and settings
- **Onboarding Module**: Connected accounts repository
- **Webhooks Module**: Webhook event handling
- **Events System**: Event publishing for payment lifecycle

### Frontend Integration
1. Call `GET /:slug/intake` to load form settings
2. Display form with practice branding
3. On submit, call `POST /create` to get `payment_link_url`
4. Redirect client to `payment_link_url` (Stripe's hosted payment page)
5. Client completes payment on Stripe's page
6. Client is redirected back to your `after_completion` URL
7. Poll `GET /:uuid/status` to check payment completion
8. Display success/failure based on status

### Webhook Flow
1. Stripe sends webhook to `/api/webhooks/stripe`
2. Webhooks module verifies signature and routes to appropriate handler
3. Payment handler checks if Payment Intent is from a Payment Link (via `payment_link` property)
4. If Payment Link detected, payment handler calls practice client intake handler
5. Intake handler uses `findPracticeClientIntakeByPaymentIntent` to locate intake record
6. Handler updates intake status in database (including `stripePaymentIntentId` if not already set)
7. Handler publishes event for downstream processing with full context
8. Other modules can subscribe to events for notifications, analytics, etc.

**Note:** Payment Intents created via Payment Links include a `payment_link` property that identifies the originating Payment Link. The handlers use this to determine if an intake record exists for the payment.

---

## Testing

### Manual Testing
1. **Get Settings**: `GET /api/practice/client-intakes/my-practice/intake`
2. **Create Intake**: `POST /api/practice/client-intakes/create` with valid payload
3. **Update Amount**: `PUT /api/practice/client-intakes/{uuid}` with new amount
4. **Check Status**: `GET /api/practice/client-intakes/{uuid}/status`

### Test Scenarios
- Practice with payment links disabled → 404
- Practice without connected account → 404
- Invalid amount (too low/high) → 400
- Invalid email format → 400
- Update amount after payment succeeded → 400
- Check status of non-existent intake → 404

---

## Future Enhancements

- [ ] Support for multiple payment methods (beyond card)
- [ ] Recurring payment support for retainer intakes
- [ ] Partial payment support
- [ ] Refund capabilities
- [ ] Email notifications on payment success/failure
- [ ] Admin dashboard for viewing intakes
- [ ] Export functionality for accounting integration
