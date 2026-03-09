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
// After successful payment:
// - report 1 invoice fee unit
// - report payout fee cents as a separate metered event
```

#### 4.2 Fee Calculation

```typescript
// Current backend model:
// payout metered fee = Stripe processing fee + variable platform fee
const payoutMeteredFeeCents = stripeFee + variablePlatformFee;
```

#### 4.3 Refund Credits

Partial refunds are allowed.

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
