# Subscriptions and Practice Onboarding

Status: Implemented with limited usage reporting
Last verified: 2026-07-13

## Purpose

Subscriptions control paid access to Blawby, while practice onboarding establishes the organization, payment-processing account, and minimum configuration required to operate.

## Actors

- Practice owner
- Practice administrator
- Stripe Billing
- Stripe Connect
- Webhook and background workers

## Core behavior

Implemented capabilities include subscription-plan management, subscription checkout or compatible authentication flows, cancellation and billing-portal access, Stripe Connect onboarding, connected-account readiness checks, and platform-fee collection on supported payments.

The product currently describes a flat subscription price, but billing amounts and fee rates are configuration-owned and must be verified before external publication.

## Main workflows

### Create practice and subscribe

1. User authenticates and creates or receives a practice organization.
2. User selects the available subscription plan.
3. Backend creates or reuses the relevant Stripe customer and subscription context.
4. Stripe confirms checkout or subscription state.
5. Webhooks update local subscription state idempotently.
6. Product access reflects the authoritative state.

### Connect payment account

1. Authorized practice owner starts Stripe Connect onboarding.
2. Backend creates or reuses the connected account.
3. User completes Stripe-hosted onboarding.
4. Backend refreshes account capability and requirement status.
5. Payment features are enabled only when required capabilities are ready.

### Manage subscription

1. Authorized owner opens the billing portal or cancellation flow.
2. Stripe processes the requested change.
3. Webhook events update local state.
4. Access and grace-period behavior follow code-owned policy.

## Subscription states

The exact enum is code-owned. Product behavior must account for:

- Incomplete or pending
- Trialing where configured
- Active
- Past due
- Cancelled or scheduled for cancellation
- Unpaid or otherwise restricted

The system must not treat checkout initiation as proof of an active subscription.

## Business rules

- One external customer or subscription must not be duplicated by retries.
- Stripe webhook processing must be idempotent.
- Access decisions must use a documented authoritative subscription state.
- Only authorized practice owners may change billing or Connect configuration.
- Connected-account readiness must depend on current Stripe capabilities and outstanding requirements.
- Cancellation timing, grace periods, and data retention must be explicit.
- Platform fees must use configured values and auditable transaction records.
- Subscription billing and client-payment processing are separate financial concerns.

## Permissions

Practice members may view limited subscription status where useful. Only owners or explicitly authorized administrators may initiate checkout, open the billing portal, cancel, or modify the connected payment account.

## Side effects

- Stripe customer and subscription creation
- Checkout and billing-portal sessions
- Connected-account creation
- Webhook jobs
- Access-state changes
- Billing and audit records
- Owner notifications

## Failure behavior

- Duplicate request: reuse existing Stripe and local records where safe.
- Webhook replay: acknowledge without duplicate state changes.
- Checkout abandoned: remain incomplete rather than active.
- Connected-account requirements incomplete: keep payment features disabled and expose actionable status.
- Stripe unavailable: preserve local state and retry reconciliation.
- Unauthorized billing action: forbidden.

## Security

- Never store raw card or bank credentials.
- Verify Stripe webhook signatures.
- Protect billing-portal and onboarding links from unauthorized users.
- Avoid exposing connected-account details beyond operational need.
- Audit subscription and payout-configuration changes.

## Known limitations

- A practice-facing usage-based billing dashboard is not complete.
- Exact price and platform-fee values may change through configuration.
- Entitlement behavior for past-due and cancelled states requires a formally documented policy.

## Acceptance criteria

- Subscription retries do not create duplicate customers or subscriptions.
- Webhook replay does not duplicate state changes.
- Payment processing remains unavailable until Stripe Connect requirements are satisfied.
- Non-owners cannot alter practice billing configuration.
- Local subscription state converges with Stripe after delayed events.
- Marketing documentation does not hard-code unverified rates as guaranteed terms.

## Code ownership

Primary areas:

- `src/modules/subscriptions/`
- `src/modules/onboarding/`
- `src/modules/stripe/`
- Better Auth subscription-compatibility handlers
- Stripe webhook and worker infrastructure
- shared fee configuration and services