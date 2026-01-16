## Onboarding Module

### Purpose and boundaries
Manages Stripe Connect onboarding for organizations. Creates connected accounts, generates onboarding links, and tracks connected account status through Stripe webhooks. This module owns the connected account persistence and readiness status used by payment flows.

### Routes and endpoints (auth requirements)
- `POST /api/onboarding/session` (auth required): Create an onboarding session for an organization.
- `POST /api/onboarding/connected-accounts` (auth required): Create or fetch a connected account and onboarding link.
- `GET /api/onboarding/organization/{organizationId}/status` (auth required): Get connected account status and readiness.
- `POST /api/onboarding/webhooks/stripe-connect` (public, Stripe signature required): Handle Stripe Connect webhooks.

### Data model (tables/schemas) and repositories
**Table:** `stripe_connected_accounts`
- Columns: `organization_id`, `stripe_account_id`, `charges_enabled`, `payouts_enabled`, `details_submitted`,
  `business_type`, `company`, `individual`, `requirements`, `future_requirements`, `capabilities`,
  `external_accounts`, `tos_acceptance`, `metadata`, `onboarding_completed_at`, `last_refreshed_at`
- Repository: `src/modules/onboarding/repositories/onboarding.repository.ts`
- Connected accounts query repo: `src/modules/onboarding/database/queries/connected-accounts.repository.ts`

### Services and key business logic
- `connected-accounts.service.ts`: Creates Stripe accounts, onboarding links, and computes readiness status.
- `onboarding.service.ts`: Entry points for API routes to start onboarding and read status.
- Webhook handlers update account state from Stripe events: `account.updated`, `capability.updated`,
  and `account.external_account.*`.

### Required environment variables
- `STRIPE_SECRET_KEY` - Stripe API key for account creation and account link generation.
- `STRIPE_CONNECT_WEBHOOK_SECRET` - Webhook secret for Stripe Connect events.
- `FRONTEND_URL` - Used for onboarding return and refresh URLs (if configured by routes).

### Security and compliance considerations
- Webhook signature verification is required for Connect webhooks.
- Sensitive account data is stored in JSON fields; limit exposure in logs and responses.
- Readiness status must consider Stripe requirements and capability status before enabling payment flows.
