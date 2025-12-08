# Blawby Subscription APIs

Complete API documentation for subscription management endpoints, including both our custom APIs and Better Auth's native APIs.

## Base URL

```
http://localhost:3000
```

## Authentication

All endpoints require Bearer token authentication:

```
Authorization: Bearer YOUR_AUTH_TOKEN
```

To get an auth token, use the Better Auth sign-in endpoint:
```
POST /api/auth/sign-in/email
Body: { "email": "user@example.com", "password": "password" }
Response Header: Set-Auth-Token
```

---

## Our Custom Subscription APIs

These are our wrapper APIs that add plan UUID support, database enrichment, and organization validation.

### 1. List Subscription Plans

Get all available subscription plans from our database.

**Endpoint:** `GET /api/subscriptions/plans`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Response:**
```json
{
  "plans": [
    {
      "id": "uuid",
      "name": "starter",
      "displayName": "Starter Plan",
      "description": "Basic plan for small practices",
      "stripeProductId": "prod_xxx",
      "stripeMonthlyPriceId": "price_xxx",
      "stripeYearlyPriceId": "price_yyy",
      "monthlyPrice": "29.00",
      "yearlyPrice": "290.00",
      "currency": "usd",
      "features": ["feature1", "feature2"],
      "limits": {
        "users": 5,
        "invoices_per_month": 50,
        "storage_gb": 10
      },
      "meteredItems": [
        {
          "priceId": "price_xxx",
          "meterName": "user_seat",
          "type": "metered_users"
        }
      ],
      "isActive": true,
      "isPublic": true
    }
  ]
}
```

**cURL:**
```bash
curl -X GET "http://localhost:3000/api/subscriptions/plans" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

### 2. Get Current Subscription (Enriched)

Get the current active subscription with line items and events from our database.

**Endpoint:** `GET /api/subscriptions/current`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Response:**
```json
{
  "subscription": {
    "id": "sub_xxx",
    "plan": "starter",
    "referenceId": "org_id",
    "stripeCustomerId": "cus_xxx",
    "stripeSubscriptionId": "sub_xxx",
    "status": "active",
    "periodStart": "2025-01-01T00:00:00Z",
    "periodEnd": "2025-02-01T00:00:00Z",
    "lineItems": [
      {
        "id": "uuid",
        "subscriptionId": "sub_xxx",
        "stripeSubscriptionItemId": "si_xxx",
        "stripePriceId": "price_xxx",
        "itemType": "base_fee",
        "quantity": 1,
        "unitAmount": "29.00",
        "description": "Starter Plan"
      },
      {
        "itemType": "metered_users",
        "quantity": 3,
        "description": "Additional User Seat"
      }
    ],
    "events": [
      {
        "id": "uuid",
        "subscriptionId": "sub_xxx",
        "eventType": "created",
        "fromStatus": null,
        "toStatus": "active",
        "triggeredByType": "user",
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ]
  }
}
```

**cURL:**
```bash
curl -X GET "http://localhost:3000/api/subscriptions/current" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

### 3. Create Subscription (with Plan UUID)

Create or upgrade a subscription using plan UUID from our database.

**Endpoint:** `POST /api/subscriptions/create`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "planId": "123e4567-e89b-12d3-a456-426614174000",
  "plan": "starter",
  "successUrl": "http://localhost:3000/dashboard?subscription=success",
  "cancelUrl": "http://localhost:3000/pricing?subscription=cancelled",
  "disableRedirect": false
}
```

**Note:** `planId` is required (UUID), `plan` is optional (fallback).

**Response:**
```json
{
  "subscriptionId": "sub_xxx",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_xxx",
  "message": "Subscription created successfully"
}
```

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/subscriptions/create" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "123e4567-e89b-12d3-a456-426614174000",
    "successUrl": "http://localhost:3000/dashboard?subscription=success",
    "cancelUrl": "http://localhost:3000/pricing?subscription=cancelled",
    "disableRedirect": false
  }'
```

---

### 4. Cancel Subscription

Cancel the current active subscription.

**Endpoint:** `POST /api/subscriptions/cancel`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "immediately": false
}
```

**Response:**
```json
{
  "subscription": {
    "id": "sub_xxx",
    "status": "canceled"
  },
  "message": "Subscription will be cancelled at the end of the billing period"
}
```

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/subscriptions/cancel" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "immediately": false
  }'
```

---

### 5. Get Subscription by ID

Get a specific subscription by ID with line items and events.

**Endpoint:** `GET /api/subscriptions/:subscriptionId`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Path Parameters:**
- `subscriptionId` (string, required): The subscription ID

**Response:**
```json
{
  "subscription": {
    "id": "sub_xxx",
    "plan": "starter",
    "referenceId": "org_id",
    "stripeCustomerId": "cus_xxx",
    "stripeSubscriptionId": "sub_xxx",
    "status": "active",
    "periodStart": "2025-01-01T00:00:00Z",
    "periodEnd": "2025-02-01T00:00:00Z",
    "lineItems": [...],
    "events": [...]
  }
}
```

**cURL:**
```bash
curl -X GET "http://localhost:3000/api/subscriptions/sub_xxx" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

## Better Auth Native APIs

These are Better Auth's built-in subscription APIs. They return Better Auth's response format (no line items, no events, plan names only).

### 6. List Subscriptions (Better Auth)

Get all subscriptions for an organization using Better Auth's native API.

**Endpoint:** `GET /api/auth/subscription/list`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Query Parameters:**
- `referenceId` (string, optional): Organization ID to filter subscriptions (e.g., 'org_123')

**Response (Better Auth format):**
```json
{
  "subscriptions": [
    {
      "id": "sub_123",
      "status": "active",
      "plan": "professional",
      "referenceId": "org_123",
      "stripeCustomerId": "cus_xxx",
      "stripeSubscriptionId": "sub_xxx",
      "limits": {
        "projects": 10
      }
    }
  ]
}
```

**cURL:**
```bash
# List all subscriptions for current user
curl -X GET "http://localhost:3000/api/auth/subscription/list" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# List subscriptions for specific organization
curl -X GET "http://localhost:3000/api/auth/subscription/list?referenceId=org_123" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Important Notes:**
- ✅ This endpoint **DOES exist** as an HTTP endpoint (verified from Better Auth docs)
- ⚠️ Requires session authentication (Bearer token)
- ⚠️ Returns Better Auth's basic format (no line items, no events)
- ✅ Use `/api/subscriptions/current` for enriched data with line items and events
- ⚠️ Token must be URL-decoded (replace `%2F` with `/`, `%3D` with `=`)

**Troubleshooting 401 Errors:**
1. ✅ Ensure token is URL-decoded
2. ✅ Verify token is not expired
3. ✅ Check that token was obtained from `/api/auth/sign-in/email` response header `Set-Auth-Token`
4. ✅ Make sure you have proper authorization for the `referenceId` (if provided)

---

### 7. Upgrade Subscription (Better Auth)

Create or upgrade a subscription using Better Auth's API directly.

**Endpoint:** `POST /api/auth/subscription/upgrade`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "plan": "professional",
  "referenceId": "org_id",
  "successUrl": "http://localhost:3000/dashboard",
  "cancelUrl": "http://localhost:3000/pricing",
  "disableRedirect": false,
  "seats": 10,
  "annual": false,
  "subscriptionId": "sub_xxx"
}
```

**Required Parameters:**
- `plan` (string) - Plan name (e.g., "professional")
- `successUrl` (string) - Redirect URL after successful payment
- `cancelUrl` (string) - Redirect URL if user cancels

**Optional Parameters:**
- `referenceId` (string) - Organization ID (defaults to current user ID)
- `annual` (boolean) - Upgrade to annual plan if available
- `seats` (number) - Number of seats for team plans
- `subscriptionId` (string) - **Required if user already has active subscription** (prevents duplicate subscriptions)
- `disableRedirect` (boolean) - If true, returns URL instead of redirecting
- `metadata` (object) - Custom metadata to attach

**Note:** Uses plan name (string), not UUID. For UUID support, use `/api/subscriptions/create`.

**Response (Better Auth format):**
```json
{
  "data": {
    "subscriptionId": "sub_xxx",
    "url": "https://checkout.stripe.com/c/pay/cs_test_xxx"
  }
}
```

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/auth/subscription/upgrade" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "professional",
    "referenceId": "org_id",
    "successUrl": "http://localhost:3000/dashboard",
    "cancelUrl": "http://localhost:3000/pricing",
    "disableRedirect": false
  }'
```

**Important Warning:**
⚠️ If user already has an active subscription, you **MUST** provide `subscriptionId` to avoid creating duplicate subscriptions and charging the user twice!

---

### 8. Cancel Subscription (Better Auth)

Cancel a subscription using Better Auth's API directly. Redirects to Stripe Billing Portal.

**Endpoint:** `POST /api/auth/subscription/cancel`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "referenceId": "org_123",
  "subscriptionId": "sub_xxx",
  "returnUrl": "/account"
}
```

**Parameters:**
- `returnUrl` (string, required) - URL to redirect to after Stripe Billing Portal session
- `referenceId` (string, optional) - Organization ID (defaults to current user ID)
- `subscriptionId` (string, optional) - Stripe subscription ID to cancel

**Response (Better Auth format):**
```json
{
  "url": "https://billing.stripe.com/session/..."
}
```

**Note:** This endpoint redirects to Stripe Billing Portal where users can confirm or modify the cancellation.

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/auth/subscription/cancel" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "referenceId": "org_123",
    "subscriptionId": "sub_xxx",
    "returnUrl": "/account"
  }'
```

---

## Better Auth Authentication APIs

### 9. Sign In (Email/Password)

**Endpoint:** `POST /api/auth/sign-in/email`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "session": {
    "id": "session_id",
    "expiresAt": "2025-01-02T00:00:00Z"
  }
}
```

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password"
  }'
```

---

### 10. Sign Up (Email/Password)

**Endpoint:** `POST /api/auth/sign-up/email`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "session": {
    "id": "session_id",
    "expiresAt": "2025-01-02T00:00:00Z"
  }
}
```

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password",
    "name": "John Doe"
  }'
```

---

### 11. Get Session

**Endpoint:** `GET /api/auth/session`

**Headers:**
```
Authorization: Bearer {token}
```

**Important:** Make sure your Bearer token is **URL-decoded**. If your token contains `%2F` or `%3D`, decode it first:
- Encoded: `JUvLKnVHuZVYpDb1Nxc8Lf7Oai2xAtGH.b4G71EzBDmG7PccJslJA83J9XI8S%2FsfxugNwhczCcVQ%3D`
- Decoded: `JUvLKnVHuZVYpDb1Nxc8Lf7Oai2xAtGH.b4G71EzBDmG7PccJslJA83J9XI8S/sfxugNwhczCcVQ=`

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "session": {
    "id": "session_id",
    "expiresAt": "2025-01-02T00:00:00Z"
  }
}
```

**cURL:**
```bash
# Make sure token is URL-decoded (no %2F or %3D)
curl -X GET "http://localhost:3000/api/auth/session" \
  -H "Authorization: Bearer YOUR_DECODED_TOKEN"
```

**Troubleshooting 401 Errors:**
1. ✅ Ensure token is URL-decoded (replace `%2F` with `/`, `%3D` with `=`)
2. ✅ Verify token is not expired
3. ✅ Check that token was obtained from `/api/auth/sign-in/email` response header `Set-Auth-Token`
4. ✅ Make sure server is running and Better Auth is configured correctly

---

### 12. Sign Out

**Endpoint:** `POST /api/auth/sign-out`

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true
}
```

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/auth/sign-out" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Better Auth Organization APIs

### 13. List Organizations

**Endpoint:** `GET /api/auth/organization/list`

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "data": [
    {
      "id": "org_id",
      "name": "My Organization",
      "slug": "my-organization",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

**cURL:**
```bash
curl -X GET "http://localhost:3000/api/auth/organization/list" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 14. Get Organization

**Endpoint:** `GET /api/auth/organization/get`

**Query Parameters:**
- `organizationId` (string, required)

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "data": {
    "id": "org_id",
    "name": "My Organization",
    "slug": "my-organization",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

**cURL:**
```bash
curl -X GET "http://localhost:3000/api/auth/organization/get?organizationId=org_id" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 15. Create Organization

**Endpoint:** `POST /api/auth/organization/create`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My Organization",
  "slug": "my-organization"
}
```

**Response:**
```json
{
  "data": {
    "id": "org_id",
    "name": "My Organization",
    "slug": "my-organization",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/auth/organization/create" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Organization",
    "slug": "my-organization"
  }'
```

---

### 16. Update Organization

**Endpoint:** `POST /api/auth/organization/update`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "organizationId": "org_id",
  "name": "Updated Name",
  "slug": "updated-slug"
}
```

**Response:**
```json
{
  "data": {
    "id": "org_id",
    "name": "Updated Name",
    "slug": "updated-slug"
  }
}
```

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/auth/organization/update" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org_id",
    "name": "Updated Name"
  }'
```

---

### 17. Set Active Organization

**Endpoint:** `POST /api/auth/organization/set-active`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "organizationId": "org_id"
}
```

**Response:**
```json
{
  "data": {
    "activeOrganizationId": "org_id"
  }
}
```

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/auth/organization/set-active" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org_id"
  }'
```

---

### 18. List Members

**Endpoint:** `GET /api/auth/organization/member/list`

**Query Parameters:**
- `organizationId` (string, required)

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "data": [
    {
      "id": "member_id",
      "userId": "user_id",
      "organizationId": "org_id",
      "role": "owner",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

**cURL:**
```bash
curl -X GET "http://localhost:3000/api/auth/organization/member/list?organizationId=org_id" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 19. Create Invitation

**Endpoint:** `POST /api/auth/organization/invitation/create`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "organizationId": "org_id",
  "email": "newuser@example.com",
  "role": "member"
}
```

**Response:**
```json
{
  "data": {
    "id": "invitation_id",
    "organizationId": "org_id",
    "email": "newuser@example.com",
    "role": "member",
    "status": "pending"
  }
}
```

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/auth/organization/invitation/create" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org_id",
    "email": "newuser@example.com",
    "role": "member"
  }'
```

---

### 20. Accept Invitation

**Endpoint:** `POST /api/auth/organization/invitation/accept`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "invitationId": "invitation_id"
}
```

**Response:**
```json
{
  "data": {
    "invitation": {
      "id": "invitation_id",
      "organizationId": "org_id",
      "status": "accepted"
    }
  }
}
```

**cURL:**
```bash
curl -X POST "http://localhost:3000/api/auth/organization/invitation/accept" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invitationId": "invitation_id"
  }'
```

---

## API Comparison

| Feature | Our APIs | Better Auth APIs |
|----------|----------|------------------|
| **Plan UUID Support** | ✅ Yes | ❌ No (plan names only) |
| **Line Items** | ✅ Yes (enriched) | ❌ No |
| **Events/Audit Trail** | ✅ Yes | ❌ No |
| **Organization Validation** | ✅ Yes | ⚠️ Partial |
| **Response Format** | ✅ Consistent | ⚠️ Better Auth format |
| **OpenAPI Docs** | ✅ Yes | ❌ No |

## Recommendations

### Use Our APIs When:
- ✅ You need plan UUIDs (not just plan names)
- ✅ You need enriched data (line items, events)
- ✅ You want consistent response format
- ✅ You need organization-level validation

### Use Better Auth APIs When:
- ✅ Simple use case (plan names only)
- ✅ Using Better Auth client SDK directly
- ✅ Don't need enrichment
- ✅ Frontend-only integration

## Notes

1. **All endpoints require Bearer token authentication** (except sign-in/sign-up)
2. **All subscription endpoints (except `/plans`) require an active organization** in the user's session
3. **The authToken** should be obtained from the Better Auth sign-in endpoint
4. **The activeOrganizationId** is set in the session when a user selects an organization
5. **Subscription plans** are synced from Stripe products/prices via webhooks
6. **Stripe customer** is automatically created when creating a subscription if it doesn't exist
7. **IOLTA Compliance**: All subscriptions are created on the platform account (not connected accounts)
8. **Better Auth APIs** return Better Auth's native format (no enrichment)
9. **Our APIs** wrap Better Auth and add database enrichment

## Import Files

- **Postman Collection**: `subscription-apis.postman.json`
- **JSON API Collection**: `subscription-apis.json`
- **Markdown Documentation**: `SUBSCRIPTION_APIS.md` (this file)
