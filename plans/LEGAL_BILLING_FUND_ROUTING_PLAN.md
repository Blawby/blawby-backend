# Legal Billing Fund Routing Plan

**Issue**: [GitHub #74 - Billing/Invoicing Plan](https://github.com/Blawby/blawby-backend/issues/74)
**Base Branch**: `feature/invoices-and-retainer`
**Date**: 2026-02-06

---

## Current Flow (From PHP Blawby Repo)

The existing system is **simple and already correct** for most legal billing:

```
1. Create Invoice → Stripe invoice with "on_behalf_of" lawyer
2. Customer Pays → Stripe webhook "invoice.paid"
3. Immediate Transfer → Full amount to lawyer's connected account
4. Platform Fee → Metered billing event recorded, charged monthly
```

**No escrow. No client approval. No holding funds.**

Refunds follow the same split-ledger model:
- client money is refunded from the Platform account
- connected-account transfer is reversed when applicable
- Platform fees are corrected through metered billing credits, not Stripe application-fee refunds

---

## What Issue #74 Actually Needs

The issue proposes adding **fund routing metadata** (trust vs operating) and **invoice type classification** - NOT adding escrow/approval flows that don't exist.

### The Real Problem to Solve

| Invoice Type | Where Money Should Go | Current System | Gap |
|--------------|----------------------|----------------|-----|
| **Flat Fee** | Lawyer's operating account | Works (immediate transfer) | Need type classification |
| **Retainer Deposit** | Lawyer's trust account | Works (immediate transfer) | Need metadata for trust routing |
| **Phased Fee** | Lawyer's operating account | Works (immediate transfer) | Need type classification |

The Platform transfers immediately regardless - **the lawyer is responsible** for routing to trust vs operating based on metadata. This matches the Issue #74 recommendation:

> "Platform transfers to Practice and Practice manages trust. Trust accounting is the attorney's ethical obligation, not the Platform's."

---

## What Already Exists (feature/invoices-and-retainer)

### Database Schema
- `invoices` table with Stripe integration
- `invoice_line_items` table
- `billing_transactions` table
- `matters.retainer_balance` column

### Services
- `invoices.service.ts` - CRUD
- `stripe-invoices.service.ts` - Stripe Invoice API
- `invoice-webhooks.service.ts` - Webhook handling

### Flow (should match PHP)
- Invoice created → Stripe invoice with connected account
- Customer pays → `invoice.paid` webhook
- Immediate transfer → Full amount to lawyer
- Metered billing → Platform fee recorded

---

## Implementation Plan

### Phase 1: Schema Changes

#### 1.1 Add Invoice Type Classification

**File**: `src/modules/invoices/database/schema/invoices.schema.ts`

```typescript
export const invoiceTypeEnum = pgEnum('invoice_type', [
  'flat_fee',           // Earned upon receipt → operating
  'phase_fee',          // Earned upon receipt per phase → operating
  'retainer_deposit',   // Client funds → trust (lawyer routes internally)
]);
```

#### 1.2 Add Fund Destination Metadata

```typescript
// Add to invoices table:
fund_destination: varchar('fund_destination', { length: 20 })
  .notNull()
  .default('operating'),  // 'operating' | 'trust'
```

#### 1.3 Migration

```sql
-- Add invoice_type enum
CREATE TYPE invoice_type AS ENUM ('flat_fee', 'phase_fee', 'retainer_deposit');

ALTER TABLE invoices
ADD COLUMN invoice_type invoice_type NOT NULL DEFAULT 'flat_fee';

ALTER TABLE invoices
ADD COLUMN fund_destination VARCHAR(20) NOT NULL DEFAULT 'operating'
CHECK (fund_destination IN ('operating', 'trust'));
```

---

### Phase 2: Transfer Metadata

#### 2.1 Update Transfer Logic

When creating the Stripe transfer, include routing metadata so lawyers know where to route funds:

**File**: `src/modules/invoices/services/invoice-webhooks.service.ts`

```typescript
// In handleInvoicePaid, when creating transfer:
await stripe.transfers.create({
  amount: invoice.amount_paid,
  currency: 'usd',
  destination: connectedAccountId,
  metadata: {
    invoice_id: invoice.id,
    invoice_type: invoice.invoice_type,
    fund_destination: invoice.fund_destination,  // 'operating' or 'trust'
    matter_id: invoice.matter_id,
  },
});
```

This metadata tells the lawyer's accounting system whether to route to trust or operating.

---

### Phase 3: Retainer Balance Tracking

#### 3.1 Update Retainer Balance on Payment

When a `retainer_deposit` invoice is paid, increment the matter's retainer balance:

```typescript
// In handleInvoicePaid:
if (invoice.invoice_type === 'retainer_deposit') {
  await db.update(matters)
    .set({
      retainer_balance: sql`retainer_balance + ${invoice.amount_paid}`,
    })
    .where(eq(matters.id, invoice.matter_id));
}
```

#### 3.2 Retainer Draw (Already Exists)

The `feature/invoices-and-retainer` branch should already have retainer draw logic that:
- Decrements `retainer_balance`
- Creates billing transaction record
- Records metered usage for platform fee

---

### Phase 4: Metered Billing

#### 4.1 Record Invoice Fee on Payment

**File**: `src/modules/invoices/services/invoice-webhooks.service.ts`

```typescript
// The webhook computes payoutMeteredFeeCents and dispatches InvoicePaid.
await InvoicePaid.dispatch({
  invoice_id: invoice.id,
  organization_id: invoice.organization_id,
  amount_paid: stripeInvoice.amount_paid,
  metered_fee_cents: payoutMeteredFeeCents,
}, { tx, critical: true });

// invoices/listeners.ts consumes InvoicePaid and reports two Stripe meter events:
await stripe.v2.billing.meterEvents.create({
  event_name: 'invoice_fee',
  identifier: `${organizationId}-invoice_fee-${invoice.id}`,
  payload: {
    stripe_customer_id: organizationStripeCustomerId,
    value: '1',
  },
});

await stripe.v2.billing.meterEvents.create({
  event_name: 'payout_fee',
  identifier: `${organizationId}-payout_fee-payout:${invoice.id}`,
  payload: {
    stripe_customer_id: organizationStripeCustomerId,
    value: payoutMeteredFeeCents.toString(),
  },
});

// These can be simple sequential awaits. If a future MeteringClient adds bulk
// create support, the two events could be batched, but the current code sends
// them individually through meteredProductsService.reportMeteredUsage(...).
```

#### 4.2 Fee Calculation

```typescript
// Current backend model lives in invoice-webhooks.service.ts:calculateMeteredFeeCents
const chargeId = getChargeIdFromInvoice(stripeInvoice);
const variablePlatformFee = Math.round(stripeInvoice.amount_paid * 0.01337);

let stripeFee = 0;
if (chargeId) {
  try {
    const charge = await stripe.charges.retrieve(chargeId, {
      expand: ['balance_transaction'],
    });
    stripeFee = typeof charge.balance_transaction === 'string'
      ? 0
      : (charge.balance_transaction?.fee ?? 0);
  } catch (error) {
    logger.error('Failed to fetch Stripe balance transaction fee', { chargeId, error });
    stripeFee = 0;
  }
}

const payoutMeteredFeeCents = stripeFee + variablePlatformFee;
```

Notes:
- `stripeFee` comes from Stripe's balance transaction on the captured charge
- `variablePlatformFee` is a percentage of `stripeInvoice.amount_paid` and is rounded with `Math.round(...)`
- if `balance_transaction` is unavailable or Stripe retrieval fails, the system falls back to the variable-only estimate

#### 4.3 Refund Credits

Partial refunds are allowed.

Current implementation lives in `src/modules/invoices/services/refund-requests.service.ts` and `src/modules/invoices/listeners.ts`.

Execution flow:

1. Practice executes a refund request
2. Backend first claims the refund request by transitioning it to `executing`; because new refund requests are blocked while any request is `requested`, `approved`, or `executing`, only one in-flight refund can exist per invoice at a time
3. Backend re-checks remaining refundable balance under an invoice row lock in a DB transaction before calling Stripe
4. For a same-day full refund, backend first attempts to cancel the Stripe `PaymentIntent` if it is still in `requires_capture`
5. Otherwise backend calls `stripe.refunds.create({ payment_intent, amount, reverse_transfer: true })` with an idempotency key derived from `refundRequest.id`
6. Service records a `billing_transactions` refund audit row
7. For `retainer_deposit` invoices, the same DB transaction decrements `matters.retainer_balance`
8. After that transaction commits, service dispatches `InvoiceRefunded`
9. `invoices/listeners.ts` reports negative metered usage credits and queues a Graphile Worker retry job if Stripe meter reporting fails
10. If Stripe refund succeeded but local persistence failed, backend queues a refund-reconciliation worker job to repair the refund request / audit state and then re-dispatch `InvoiceRefunded`

Implementation sketch:

```typescript
const canceledPaymentIntent = await maybeCancelCancelablePaymentIntent(...);

const refund = canceledPaymentIntent ?? await stripe.refunds.create({
  payment_intent: stripePaymentIntentId,
  amount: requestedAmount,
  reverse_transfer: true,
}, {
  idempotencyKey: `refund_request_${refundRequest.id}`,
});

const isFullRefund = refund.amount === amountPaidCents;
const payoutFeeCreditCents = amountPaidCents > 0
  ? Math.round((refund.amount / amountPaidCents) * originalPayoutFeeCents)
  : 0;

await InvoiceRefunded.dispatch({
  invoice_id: invoice.id,
  organization_id: invoice.organization_id,
  refund_request_id: refundRequest.id,
  refunded_amount: refund.amount,
  payout_fee_credit_cents: payoutFeeCreditCents,
  credit_invoice_fee: isFullRefund,
});
```

Listener-side metered credits:

```typescript
await reportMeteredUsageWithRetry({
  organizationId,
  meteredType: METERED_TYPES.INVOICE_FEE,
  quantity: -1,
  deduplicationId: `refund:${refundRequestId}:invoice_fee`,
  invoiceId,
  failureLabel: 'invoice fee credit',
});

await reportMeteredUsageWithRetry({
  organizationId,
  meteredType: METERED_TYPES.PAYOUT_FEE,
  quantity: -payoutFeeCreditCents,
  deduplicationId: `refund:${refundRequestId}:payout_fee`,
  invoiceId,
  failureLabel: 'payout fee credit',
});
```

Refund policy under the metered model:

- **Full refund**
  - refund payment
  - reverse transfer
  - credit `invoice_fee`
  - credit `payout_fee`
- **Partial refund**
  - refund payment
  - reverse transfer proportionally
  - credit `payout_fee` proportionally
  - do not credit `invoice_fee`

Important: this model does **not** use Stripe `application_fee_amount` or `refund_application_fee`.
For `retainer_deposit` invoices, the current implementation decrements `matters.retainer_balance` inside the same DB transaction that marks the refund request executed and writes the refund audit row.
Best practice followed here: emit `InvoiceRefunded` only after the refund transaction commits, so listener failures cannot roll back local refund state. Any mismatch after a successful Stripe refund is handled by the refund-reconciliation job rather than by retrying the DB transaction from inside the request.

---

### Phase 5: Invoice Type Configuration

#### 5.1 Set Invoice Type on Creation

When creating an invoice, allow specifying the type:

```typescript
// POST /api/invoices
{
  matter_id: "...",
  line_items: [...],
  invoice_type: "flat_fee",  // or "retainer_deposit", "phase_fee"
  // fund_destination is auto-set based on type
}
```

#### 5.2 Auto-Set Fund Destination

```typescript
function getFundDestination(invoiceType: string): string {
  switch (invoiceType) {
    case 'retainer_deposit':
      return 'trust';
    case 'flat_fee':
    case 'phase_fee':
    default:
      return 'operating';
  }
}
```

---

## What This Does NOT Include

Based on the PHP repo analysis, these features from Issue #74 are **NOT needed**:

| Feature | Status | Reason |
|---------|--------|--------|
| Escrow holding | NOT NEEDED | PHP doesn't have it, lawyers get paid immediately |
| Client approval flow | NOT NEEDED | PHP doesn't have it, no approval gate exists |
| `milestone_escrow` type | NOT NEEDED | No escrow system exists |
| `requires_client_approval` column | NOT NEEDED | All payments are automatic |
| FundRouterService | SIMPLIFIED | Just metadata on transfers, not complex routing |
| Frontend approval UI | NOT NEEDED | No approval flow to show |

---

## Priority Summary

### P0 — Must Complete

| # | Task | Effort |
|---|------|--------|
| 1 | Add `invoice_type` enum to schema | Small |
| 2 | Add `fund_destination` column | Small |
| 3 | Include metadata in Stripe transfers | Small |
| 4 | Update retainer_balance on payment | Small |
| 5 | Metered billing for platform fee | Medium |

### P1 — Before Production

| # | Task | Effort |
|---|------|--------|
| 6 | Invoice type selection in UI | Small |
| 7 | Retainer statement generation | Medium |

---

## Testing Checklist

### Flat Fee Invoice
- [ ] Create invoice with `invoice_type: 'flat_fee'`
- [ ] Customer pays
- [ ] Verify immediate transfer to connected account
- [ ] Verify transfer metadata: `{fund_destination: 'operating'}`
- [ ] Verify metered event recorded for platform fee

### Retainer Deposit Invoice
- [ ] Create invoice with `invoice_type: 'retainer_deposit'`
- [ ] Customer pays
- [ ] Verify immediate transfer to connected account
- [ ] Verify transfer metadata: `{fund_destination: 'trust'}`
- [ ] Verify `matter.retainer_balance` incremented
- [ ] Verify metered event recorded

### Retainer Draw
- [ ] Process draw against retainer balance
- [ ] Verify balance decremented
- [ ] Verify metered event for platform fee

---

## Flow Diagram

```
INVOICE PAYMENT FLOW (Matches PHP):
───────────────────────────────────

1. Create Invoice
   └─> invoice_type: 'flat_fee' | 'retainer_deposit' | 'phase_fee'
   └─> fund_destination: auto-set ('operating' or 'trust')
   └─> Stripe invoice created with "on_behalf_of" lawyer

2. Customer Pays
   └─> Stripe webhook: invoice.paid

3. Webhook Handler
   └─> Update invoice status to 'paid'
   └─> If retainer_deposit: increment matter.retainer_balance
   └─> Create Stripe transfer (IMMEDIATE, full amount)
       └─> metadata: { fund_destination, invoice_type, matter_id }
   └─> Record metered event (platform fee)
   └─> Send receipts

4. Lawyer Receives Funds
   └─> Lawyer sees metadata, routes to trust or operating
   └─> (Lawyer's responsibility, not platform's)

5. Platform Billing
   └─> Metered events aggregated monthly
   └─> Lawyer charged via subscription
```

---

## Notes

- **No escrow** - Money transfers immediately (same as PHP)
- **No client approval** - Automatic on payment (same as PHP)
- **Trust accounting is lawyer's responsibility** - Platform just provides metadata
- **Metered billing** - Platform charges lawyer monthly based on activity
- **Intakes not affected** - This is invoice-only; intakes remain separate
