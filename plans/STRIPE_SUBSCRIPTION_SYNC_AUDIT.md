# Stripe Subscription Sync — Full Audit & Fix Plan

> **Date**: 2026-02-18
> **Scope**: Complete audit of Stripe webhook handling, subscription sync, and data integrity
> **Status**: Ready for implementation

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Webhook Routing Audit](#2-webhook-routing-audit)
3. [Subscription Sync Gaps (Critical)](#3-subscription-sync-gaps-critical)
4. [Webhook Handler Audit (All Types)](#4-webhook-handler-audit-all-types)
5. [Fix Plan — Prioritized](#5-fix-plan--prioritized)
6. [Files to Modify](#6-files-to-modify)

---

## 1. Architecture Overview

### Webhook Entry Points

There are **3 webhook endpoints** receiving Stripe events:

| Endpoint | Secret | Handler | Queued? |
|----------|--------|---------|---------|
| `POST /api/auth/stripe/webhook` | `STRIPE_WEBHOOK_SECRET` | Better Auth plugin (`onEvent`) | Partially — only `CUSTOM_PROCESS_PREFIXES` are queued |
| `POST /api/webhooks/stripe/account` | `STRIPE_WEBHOOK_SECRET` | `onboardingWebhooksService.verifyAndStoreAccount` → Graphile Worker | Always |
| `POST /api/webhooks/stripe/connected-accounts` | `STRIPE_CONNECT_WEBHOOK_SECRET` | `onboardingWebhooksService.verifyAndStore` → Graphile Worker | Always |

### Event Flow for Subscription Lifecycle

```text
Stripe sends customer.subscription.* event
  │
  ├─► /api/auth/stripe/webhook (Better Auth)
  │     1. Better Auth verifies signature
  │     2. Better Auth routes internally → hooks.ts handlers
  │        • onCheckoutSessionCompleted (checkout.session.completed)
  │        • onSubscriptionCreated (customer.subscription.created)
  │        • onSubscriptionUpdated (customer.subscription.updated)
  │        • onSubscriptionDeleted (customer.subscription.deleted)
  │     3. Internal handler updates `subscriptions` table directly
  │     4. Internal handler calls YOUR callback hooks:
  │        • onSubscriptionComplete, onSubscriptionCreated
  │        • onSubscriptionUpdate, onSubscriptionCancel
  │     5. Then calls `onEvent` callback
  │        • Stores event in webhook_events table
  │        • Does NOT queue subscription events (not in CUSTOM_PROCESS_PREFIXES)
  │
  └─► /api/webhooks/stripe/account (if configured in Stripe dashboard)
        1. Stores event in webhook_events table
        2. Queues to Graphile Worker → process-stripe-webhook
        3. Worker sees isSubscriptionEvent() → logs "handled by Better Auth"
        4. Marks as processed (no-op)
```

### What Better Auth DOES Sync (via hooks.ts)

Better Auth's `@better-auth/stripe` v1.4.18 correctly updates the `subscriptions` table with:
- `status` (active, trialing, past_due, canceled, etc.)
- `periodStart` / `periodEnd` (from `subscriptionItem.current_period_start/end`)
- `cancelAtPeriodEnd`, `cancelAt`, `canceledAt`, `endedAt`
- `seats` (from `subscriptionItem.quantity`)
- `plan` (plan name)
- `stripeSubscriptionId`
- `trialStart` / `trialEnd`

**The `subscriptions` table row itself stays in sync.** The problems are all in YOUR custom layer.

### What YOUR Hooks Handle

Your hooks in `stripe.config.ts` manage:
- `organizations.activeSubscriptionId` — pointer from org to subscription
- `organizations.stripeCustomerId` — Stripe customer linkage
- `subscriptionLineItems` table — line item details
- `subscriptionEvents` table — audit log
- `SubscriptionCreated` event dispatch — internal event system

---

## 2. Webhook Routing Audit

### `onEvent` Handler — CUSTOM_PROCESS_PREFIXES

**File**: `src/shared/auth/plugins/stripe.config.ts:203`

Events queued to Graphile Worker:
```text
product.*           → subscriptionWebhooksService (plan catalog sync)
price.*             → subscriptionWebhooksService (plan catalog sync)
account.*           → onboardingWebhooksService
capability.*        → onboardingWebhooksService
payment_intent.*    → practiceClientIntakesWebhooksService
charge.*            → practiceClientIntakesWebhooksService (charge.succeeded only)
```

Events NOT queued (handled by Better Auth internally):
```text
customer.subscription.*    → Better Auth hooks → YOUR callbacks
checkout.session.completed → Better Auth hooks → YOUR callbacks
invoice.*                  → NOT handled here (handled via /api/webhooks/stripe/account)
```

### `process-stripe-webhook` Worker — Routing

**File**: `src/workers/tasks/process-stripe-webhook.ts:76-106`

```text
subscriptionWebhooksService.isSubscriptionWebhookEvent  → product.* | price.*
isSubscriptionEvent                                      → customer.subscription.* (no-op, marks processed)
isOnboardingEvent                                        → account.* | capability.*
isInvoiceEvent                                           → invoice.*
isPaymentIntentEvent || charge.succeeded                 → payment_intent.* | charge.succeeded
else                                                     → unhandled (marks processed)
```

### Routing Issues Found

#### ISSUE R1: Potential double-processing of events
Both `/api/auth/stripe/webhook` and `/api/webhooks/stripe/account` use the same `STRIPE_WEBHOOK_SECRET`.
If the same Stripe webhook endpoint is configured to send to both URLs, the same event arrives twice.
**Mitigation**: `createIfNotExists` with `onConflictDoNothing` on `stripeEventId` prevents duplicate DB rows.
The second arrival returns `alreadyProcessed: true`. **This is handled correctly.**

#### ISSUE R2: `invoice.*` events routed differently depending on entry point
- Via Better Auth webhook: stored in DB, NOT queued (not in CUSTOM_PROCESS_PREFIXES)
- Via account webhook: stored in DB, queued to worker, processed by `invoiceWebhooksService`
- **Impact**: If `invoice.*` events only hit the Better Auth endpoint, they are stored but never processed.
- **Verdict**: This works IF Stripe is configured to send invoice events to `/api/webhooks/stripe/account`.
  However, it's fragile — depends on correct Stripe Dashboard webhook configuration.

#### ISSUE R3: `onEvent` error swallowing prevents Stripe retries
**File**: `src/shared/auth/plugins/stripe.config.ts:209-215`
```ts
} catch (error) {
    logger.error('❌ Webhook Error...');
    // Do not throw; prevent Stripe from retrying infinitely on logic errors
}
```
If `createWebhookEventIfNotExists` or `addWebhookJob` fails, Better Auth doesn't know.
Stripe receives 200 OK and never retries.
**Impact**: Silent event loss for `product.*`, `price.*`, etc.

#### ISSUE R4: `addWebhookJob` is fire-and-forget
**File**: `src/shared/auth/plugins/stripe.config.ts:207`
```ts
addWebhookJob(webhookEvent.id, event.id, event.type)
    .catch((err) => logger.error('Failed to add webhook job...'));
```
If the job queue is down, the event is stored in DB (good) but never queued for processing (bad).
The event sits in `webhook_events` table with `processed: false` forever.
**No retry mechanism picks up unprocessed events from the Better Auth path.**

---

## 3. Subscription Sync Gaps (Critical)

### GAP 1: `onSubscriptionCancel` nulls `activeSubscriptionId` prematurely

**Severity**: CRITICAL — Breaks active subscription visibility
**File**: `src/shared/auth/plugins/stripe.config.ts:344-356`

**What happens**: Better Auth calls `onSubscriptionCancel` when it detects `cancel_at_period_end = true`
during a `customer.subscription.updated` event (hooks.ts:345-356). This means the user requested
cancellation at period end — the subscription is **still active and paid**.

**Your handler**:
```ts
onSubscriptionCancel: async ({ subscription }) => {
    await tx.update(schema.organizations)
        .set({ activeSubscriptionId: null })  // ← WRONG: subscription is still active!
```

**Impact**: `getCurrentSubscription` returns `null` even though the subscription is active until period end.
The app thinks the org has no subscription during the remaining paid period.

**Fix**: Do NOT null `activeSubscriptionId`. Instead, log the pending cancellation event.
The org pointer should only be cleared when the subscription actually terminates (`onSubscriptionDeleted`).

---

### GAP 2: `onSubscriptionDeleted` hook is NOT implemented

**Severity**: CRITICAL — Org points to canceled subscription forever
**File**: `src/shared/auth/plugins/stripe.config.ts` — MISSING

**What happens**: When a subscription is fully terminated (deleted) in Stripe, Better Auth:
1. Updates subscription row to `status: "canceled"` (hooks.ts:404-426)
2. Calls `options.subscription.onSubscriptionDeleted` (hooks.ts:427)

Your config does NOT implement `onSubscriptionDeleted`. So:
- Subscription row is correctly marked "canceled" by Better Auth ✅
- `org.activeSubscriptionId` still points to the dead subscription ❌
- `getCurrentSubscription` returns a canceled subscription as if it's current ❌

**Fix**: Add `onSubscriptionDeleted` handler that:
1. Sets `org.activeSubscriptionId = null`
2. Creates an audit event with `event_type: 'canceled'`

---

### GAP 3: `onSubscriptionUpdate` never receives `stripeSubscription` → line items go stale

**Severity**: HIGH — Line items never update after creation
**File**: Better Auth `hooks.ts:358` + `stripe.config.ts:296-341`

**Root cause**: Better Auth's `onSubscriptionUpdated` handler calls your callback like this:
```ts
// hooks.ts:358
await options.subscription.onSubscriptionUpdate?.({
    event,
    subscription: updatedSubscription || subscription,
    // NOTE: stripeSubscription is NOT passed
});
```

Your handler:
```ts
// stripe.config.ts:316-328
if (stripeSubscription?.items?.data) {
    // This block NEVER executes because stripeSubscription is undefined
    await Promise.all(stripeSubscription.items.data.map(...));
}
```

**Impact**: Line items are only synced on initial creation (`onSubscriptionComplete`/`onSubscriptionCreated`).
On plan changes, quantity changes, or renewals — line items go stale.

**Fix**: In `onSubscriptionUpdate`, manually retrieve the Stripe subscription using the subscription's
`stripeSubscriptionId` (available from the DB record passed by Better Auth):
```ts
const stripe = getStripeInstance();
const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
```

---

### GAP 4: `findPlanByStripePriceId` called with plan NAME (wrong parameter)

**Severity**: MEDIUM — All audit events have null plan_id
**File**: `src/shared/auth/plugins/stripe.config.ts:150`

```ts
// syncSubscriptionToOrg:
const dbPlan = await subscriptionRepository.findPlanByStripePriceId(tx, planName);
//                                                                      ^^^^^^^^
// planName = "pro" or "enterprise" — NOT a Stripe price ID like "price_xxxxx"
```

`findPlanByStripePriceId` queries `stripe_monthly_price_id` and `stripe_yearly_price_id` columns.
Passing a plan name always returns `undefined`.

**Same bug in `onSubscriptionUpdate`**:
```ts
// stripe.config.ts:332
const dbPlan = await subscriptionRepository.findPlanByStripePriceId(tx, subscription.plan);
// subscription.plan = "pro" — wrong parameter type
```

**Fix**: Use `findPlanByName` instead of `findPlanByStripePriceId`.

---

### GAP 5: Race condition between `onSubscriptionComplete` and `onSubscriptionCreated`

**Severity**: MEDIUM — Duplicate events dispatched
**File**: `src/shared/auth/plugins/stripe.config.ts:241-294`

**Flow**:
1. User completes checkout → `checkout.session.completed` fires
2. Better Auth calls `onSubscriptionComplete` → your `syncSubscriptionToOrg` runs
3. `customer.subscription.created` fires → Better Auth checks DB
4. Finds existing subscription (created during checkout) → returns early at hooks.ts:176-181
5. Your `onSubscriptionCreated` callback is **NOT called** (skipped because sub exists)

**Actually, this is correctly handled by Better Auth.** The `onSubscriptionCreated` in hooks.ts
checks for existing subscriptions and skips if found. No race condition in practice.

**However**: If the `customer.subscription.created` event arrives BEFORE `checkout.session.completed`
(unlikely but possible with network delays), then:
- `onSubscriptionCreated` creates the subscription and calls your callback
- `onCheckoutSessionCompleted` updates the same subscription and calls your callback
- Both call `syncSubscriptionToOrg` → duplicate `SubscriptionCreated` event dispatched

**Fix**: Add idempotency check in `syncSubscriptionToOrg` — check if org already has the subscription
as `activeSubscriptionId` before dispatching the event.

---

## 4. Webhook Handler Audit (All Types)

### Product/Price Handlers (subscriptionWebhooksService)

**Files**: `src/modules/subscriptions/handlers/*.handler.ts`

| Handler | Event | Status | Notes |
|---------|-------|--------|-------|
| `handleProductCreated` | `product.created` | ✅ OK | Fetches prices, extracts metadata, upserts plan |
| `handleProductUpdated` | `product.updated` | ✅ OK | Re-syncs all product data, handles name conflicts |
| `handleProductDeleted` | `product.deleted` | ✅ OK | Soft-deletes (deactivates) plan |
| `handlePriceCreated` | `price.created` | ⚠️ Minor | Only sets price if slot is empty (`!plan.stripe_monthly_price_id`) — won't replace existing |
| `handlePriceUpdated` | `price.updated` | ✅ OK | Updates amount, currency, active status |
| `handlePriceDeleted` | `price.deleted` | ✅ OK | Clears price, deactivates plan if last price |

**Minor issue with `handlePriceCreated`**: If a monthly price already exists and a new monthly price
is created (e.g., price change in Stripe), the new price is ignored. Only the metered usage branch
would process it. This could leave stale price IDs.

### Onboarding Handlers

**File**: `src/modules/webhooks/services/onboarding-webhooks.service.ts`

| Handler | Event | Status | Notes |
|---------|-------|--------|-------|
| `handleAccountUpdatedWebhook` | `account.updated` | ✅ OK | Delegates to `handleAccountUpdated` |
| `handleCapabilityUpdatedWebhook` | `capability.updated` | ✅ OK | Delegates to `handleCapabilityUpdated` |
| `handleExternalAccountCreatedWebhook` | `account.external_account.created` | ✅ OK | |
| `handleExternalAccountUpdatedWebhook` | `account.external_account.updated` | ✅ OK | |
| `handleExternalAccountDeletedWebhook` | `account.external_account.deleted` | ✅ OK | |
| `retryFailedWebhooks` | Boot-time retry | ✅ OK | Picks up failed events on restart |

**Verdict**: Onboarding webhook handling is solid. Has retry logic, proper error handling, marks
events as failed with exponential backoff.

### Invoice Handlers

**File**: `src/modules/invoices/services/invoice-webhooks.service.ts`

| Handler | Event | Status | Notes |
|---------|-------|--------|-------|
| `handleInvoicePaid` | `invoice.paid` | ✅ OK | Full transaction: update status, create transfer, update retainer, report metered usage |
| `handleInvoicePaymentFailed` | `invoice.payment_failed` | ✅ OK | Marks as overdue, dispatches event |
| `handleInvoiceVoided` | `invoice.voided` | ✅ OK | |
| `handleInvoiceDeleted` | `invoice.deleted` | ✅ OK | |
| Missing | `invoice.created` | ⚠️ Note | Not handled — probably intentional since invoices are created locally first |
| Missing | `invoice.finalized` | ⚠️ Note | Not handled — may want to track finalization |

**Verdict**: Invoice handling is solid for the events that matter (paid, failed, voided, deleted).

### Payment Intent / Charge Handlers

**File**: `src/modules/webhooks/services/practice-client-intakes-webhooks.service.ts`

| Handler | Event | Status | Notes |
|---------|-------|--------|-------|
| `handlePracticeClientIntakeSucceededWebhook` | `payment_intent.succeeded` | ✅ OK | |
| `handlePracticeClientIntakeFailedWebhook` | `payment_intent.payment_failed` | ✅ OK | |
| `handlePracticeClientIntakeCanceledWebhook` | `payment_intent.canceled` / `charge.succeeded` | ✅ OK | |

**Verdict**: Payment intent handling is functional.

### Webhook Event Storage & Idempotency

**File**: `src/shared/repositories/stripe.webhook-events.repository.ts`

- ✅ `createIfNotExists` uses `onConflictDoNothing` on `stripeEventId` — proper idempotency
- ✅ `markFailed` implements exponential backoff retry (`2^retryCount * 60s`)
- ✅ `maxRetries` default of 3
- ⚠️ No mechanism to pick up unprocessed events from the Better Auth path (only onboarding has `retryFailedWebhooks`)

---

## 5. Fix Plan — Prioritized

### Phase 1: Critical Fixes (Subscription Sync)

#### Fix 1.1: Add `onSubscriptionDeleted` handler
**File**: `src/shared/auth/plugins/stripe.config.ts`
**After**: `onSubscriptionCancel` block

```ts
onSubscriptionDeleted: async ({ subscription }) => {
    if (!subscription.referenceId) return;

    await db.transaction(async (tx) => {
        await tx.update(schema.organizations)
            .set({ activeSubscriptionId: null })
            .where(eq(schema.organizations.id, subscription.referenceId!));

        await subscriptionRepository.createEvent(tx, {
            subscription_id: subscription.id,
            event_type: 'canceled',
            from_status: 'active',
            to_status: 'canceled',
            triggered_by_type: 'webhook',
            metadata: { plan_name: subscription.plan || '' },
        });
    });
},
```

#### Fix 1.2: Fix `onSubscriptionCancel` to NOT null `activeSubscriptionId`
**File**: `src/shared/auth/plugins/stripe.config.ts`

Change from setting `activeSubscriptionId: null` to just logging the pending cancellation:

```ts
onSubscriptionCancel: async ({ subscription }) => {
    if (!subscription.referenceId) return;

    // Do NOT null activeSubscriptionId — subscription is still active until period end.
    // Only log the cancellation request.
    await subscriptionRepository.createEvent(db, {
        subscription_id: subscription.id,
        event_type: 'cancel_requested',
        from_status: 'active',
        to_status: 'active', // Still active until period end
        triggered_by_type: 'user',
        metadata: { plan_name: subscription.plan || '' },
    });
},
```

#### Fix 1.3: Fix `onSubscriptionUpdate` to fetch Stripe subscription for line items
**File**: `src/shared/auth/plugins/stripe.config.ts`

Since Better Auth doesn't pass `stripeSubscription` to this callback, fetch it manually:

```ts
onSubscriptionUpdate: async ({ subscription }) => {
    if (!subscription.referenceId) return;

    await db.transaction(async (tx) => {
        // Update active subscription pointer
        await tx.update(schema.organizations)
            .set({ activeSubscriptionId: subscription.id })
            .where(eq(schema.organizations.id, subscription.referenceId!));

        // Fetch Stripe subscription for line item sync
        // (Better Auth does not pass stripeSubscription to this callback)
        let stripeSub: Stripe.Subscription | null = null;
        if (subscription.stripeSubscriptionId) {
            try {
                const stripe = getStripeInstance();
                stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
            } catch (err) {
                logger.warn('[Stripe Plugin] Failed to fetch Stripe subscription for line item sync', {
                    subscriptionId: subscription.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        // Update line items if available
        if (stripeSub?.items?.data) {
            await Promise.all(stripeSub.items.data.map((item) =>
                subscriptionRepository.upsertLineItem(tx, {
                    subscription_id: subscription.id,
                    stripe_subscription_item_id: item.id,
                    stripe_price_id: item.price.id,
                    item_type: 'base_fee',
                    description: item.price.nickname || item.price.product?.toString(),
                    quantity: item.quantity || 1,
                    unit_amount: item.price.unit_amount
                        ? (item.price.unit_amount / 100).toString()
                        : null,
                    metadata: {},
                }),
            ));
        }

        // Log event
        if (subscription.plan) {
            const dbPlan = await subscriptionRepository.findPlanByName(tx, subscription.plan);
            await subscriptionRepository.createEvent(tx, {
                subscription_id: subscription.id,
                plan_id: dbPlan?.id,
                to_plan_id: dbPlan?.id,
                event_type: 'plan_changed',
                triggered_by_type: 'webhook',
                metadata: { plan_name: subscription.plan },
            });
        }
    });
},
```

#### Fix 1.4: Fix `findPlanByStripePriceId` → `findPlanByName` in `syncSubscriptionToOrg`
**File**: `src/shared/auth/plugins/stripe.config.ts:150`

```diff
-    const dbPlan = await subscriptionRepository.findPlanByStripePriceId(tx, planName);
+    const dbPlan = await subscriptionRepository.findPlanByName(tx, planName);
```

### Phase 2: Reliability Fixes

#### Fix 2.1: Make `addWebhookJob` awaited in `onEvent`
**File**: `src/shared/auth/plugins/stripe.config.ts:207`

```diff
-    addWebhookJob(webhookEvent.id, event.id, event.type)
-        .catch((err) => logger.error('Failed to add webhook job: {error}', { error: err }));
+    try {
+        await addWebhookJob(webhookEvent.id, event.id, event.type);
+    } catch (err) {
+        logger.error('Failed to add webhook job: {error}', { error: err });
+        // Event is stored in DB — will need manual retry or scheduled pickup
+    }
```

#### Fix 2.2: Add idempotency check to `syncSubscriptionToOrg`
**File**: `src/shared/auth/plugins/stripe.config.ts`

Before dispatching `SubscriptionCreated` event, check if already dispatched:
```ts
// Before SubscriptionCreated.dispatch:
const existingEvents = await subscriptionRepository.findEventsBySubscriptionIdAndType(
    db, subscriptionId, 'created'
);
if (existingEvents.length === 0) {
    await SubscriptionCreated.dispatch({ ... });
}
```

#### Fix 2.3: Add type to `onSubscriptionUpdate` callback for `stripeSubscriptionId`
**File**: `src/shared/auth/plugins/stripe.config.ts:299-306`

Better Auth passes the full DB subscription record. Add `stripeSubscriptionId` to the type:
```ts
onSubscriptionUpdate: async ({
    subscription,
}: {
    event: unknown;
    subscription: {
        id: string;
        referenceId: string | null;
        plan?: string;
        stripeSubscriptionId?: string;  // ← Add this
    };
}) => {
```

### Phase 3: Operational Improvements

#### Fix 3.1: Add retry mechanism for unprocessed Better Auth webhook events
Currently only `onboardingWebhooksService.retryFailedWebhooks()` runs on boot.
Add similar retry for ALL unprocessed webhook events.

#### Fix 3.2: Improve sync script type safety
Replace `as unknown as Record<string, unknown>` casting with proper Stripe SDK types.

#### Fix 3.3: Consider adding `invoice.*` to CUSTOM_PROCESS_PREFIXES
Instead of relying on the account webhook endpoint for invoice events, handle them through
the Better Auth path too:

```diff
const CUSTOM_PROCESS_PREFIXES = [
    'product.', 'price.', 'account.', 'capability.',
    'payment_intent.', 'charge.',
+   'invoice.',
];
```

---

## 6. Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `src/shared/auth/plugins/stripe.config.ts` | Fix 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3 | Critical |
| `src/modules/subscriptions/database/queries/subscription.repository.ts` | Verify `findPlanByName` accepts tx param | Critical |
| `src/modules/subscriptions/services/subscriptionWebhooks.service.ts` | No changes needed | — |
| `scripts/sync-stripe-subscriptions.ts` | Fix 3.2 (type safety) | Low |
| `src/workers/tasks/process-stripe-webhook.ts` | Fix 3.1 (retry logic) | Medium |

### Dependencies

- Fix 1.2 MUST be deployed together with Fix 1.1 (otherwise `activeSubscriptionId` is never cleared)
- Fix 1.3 requires the `onSubscriptionUpdate` callback type to include `stripeSubscriptionId` (Fix 2.3)
- Fix 1.4 requires verifying `findPlanByName` works with a transaction parameter

---

## Summary of Findings

### What's Working Well
- Better Auth correctly syncs the `subscriptions` table (status, period dates, etc.)
- Webhook idempotency via `stripeEventId` unique constraint
- Onboarding webhook handling is solid with retry logic
- Invoice and payment intent handling is functional
- Product/price catalog sync is well-implemented

### What's Breaking
1. **`activeSubscriptionId` lifecycle is wrong** — nulled on cancel request (too early), never nulled on delete (too late)
2. **Line items never update** — Better Auth doesn't pass `stripeSubscription` to update callback
3. **Plan lookup always fails** — `findPlanByStripePriceId` called with plan name
4. **No retry for Better Auth webhook path** — events stored but not re-queued on failure
