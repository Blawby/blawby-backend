# Stripe Implementation - Master Plan

**Status**: In Progress
**Last Updated**: February 21, 2026
**Overall Completion**: ~60%

Complete implementation plan for Stripe Connect integration.

---

## Related Documents

- **Coding Standards**: [CODING_STANDARDS.md](./CODING_STANDARDS.md) - Timestamp handling, Zod conventions, service patterns
- **Build Architecture**: [build-architecture.md](./build-architecture.md) - Module system and build pipeline
- **Subscription System**: [STRIPE_SUBSCRIPTIONS_PLAN.md](./STRIPE_SUBSCRIPTIONS_PLAN.md) (Platform billing)
- **Subscription Sync Audit**: [STRIPE_SUBSCRIPTION_SYNC_AUDIT.md](./STRIPE_SUBSCRIPTION_SYNC_AUDIT.md) (Active)
- **Connect Model**: [STRIPE_CONNECT_MODEL.md](./STRIPE_CONNECT_MODEL.md) (Architecture reference)
- **Invoices**: [INVOICES_REMAINING_WORK.md](./INVOICES_REMAINING_WORK.md) (Active)
- **Legal Billing**: [LEGAL_BILLING_FUND_ROUTING_PLAN.md](./LEGAL_BILLING_FUND_ROUTING_PLAN.md) (Active)
- **Intake Payments**: [blawby-ts-intake-payments-improvements.md](./blawby-ts-intake-payments-improvements.md) (Active)

---

## Overview

This implementation enables organizations to:
1. Onboard to Stripe Connect
2. Accept payments (intakes, invoices, payment links)
3. Manage platform subscription billing
4. Track payouts and balances

---

## Phase Breakdown

### Phase 1: Stripe Connected Account Onboarding
**Status**: Completed

- Database tables: `connected_accounts`, `webhook_events`
- API routes: `/api/onboarding/connected-accounts`
- Webhook processing via Graphile Worker
- Stripe embedded onboarding component
- Completed December 2025, verified January 2026

---

### Phase 2: Payment Processing & Invoicing
**Status**: ~65% Complete

**Implemented:**
- Practice client intake payments (custom flow with payment links & checkout sessions)
- Intake triage system (pending_review, accepted, declined)
- Intake-to-matter conversion pipeline
- Payment webhooks (payment_intent.succeeded, charge.succeeded, etc.)
- Invoice module (CRUD, send, sync with Stripe) — see [INVOICES_REMAINING_WORK.md](./INVOICES_REMAINING_WORK.md)

**Remaining:**
- Invoice finalization and remaining edge cases
- Legal billing fund routing (trust vs operating) — see [LEGAL_BILLING_FUND_ROUTING_PLAN.md](./LEGAL_BILLING_FUND_ROUTING_PLAN.md)
- Refund processing

---

### Phase 3: Platform Subscription Billing
**Status**: ~70% Complete
**Reference**: [STRIPE_SUBSCRIPTIONS_PLAN.md](./STRIPE_SUBSCRIPTIONS_PLAN.md)

**Implemented:**
- Platform customer creation on organization setup
- Subscription creation and lifecycle management
- Metered billing (payment fees, payout fees)
- Better Auth Stripe plugin integration
- Webhook sync for subscription events

**Remaining:**
- Subscription sync audit fixes — see [STRIPE_SUBSCRIPTION_SYNC_AUDIT.md](./STRIPE_SUBSCRIPTION_SYNC_AUDIT.md)
- Usage reporting dashboard
- Cancellation/downgrade flows

---

### Phase 4: Payouts & Balance Management
**Status**: Not Started

- Balance tracking and sync
- Payout management
- Financial reporting

---

## Key Implementation Principles

1. **Amounts in cents** — Never floats for money
2. **Verify ownership** — Check organization_id on every request
3. **Stripe account context** — `{ stripeAccount: accountId }` on all Connect calls
4. **Webhook security** — Always verify Stripe signatures
5. **Timestamps** — Follow conventions in [CODING_STANDARDS.md](./CODING_STANDARDS.md)
6. **Error handling** — Use `result` utilities (Standard #6)
7. **Soft deletes** — Use `deleted_at` timestamps, normalize with `?? null`
8. **Logging** — Structured logging with `@logtape/logtape`

---

## Environment Setup

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://...
```

```bash
# Forward webhooks locally
stripe listen --forward-to localhost:3000/api/webhooks/stripe/account
stripe listen --forward-to localhost:3000/api/webhooks/stripe/connected-accounts --connect
```
