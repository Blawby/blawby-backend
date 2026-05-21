# Invoice Module - Remaining Work Plan

**Created:** 2026-02-04
**Status:** In Progress
**Branch:** `feature/invoices-and-retainer`

---

## Overview

The invoices module is largely implemented but requires several finishing steps before it's production-ready. The key change from the original plan is using **Stripe hosted invoice pages** instead of custom token-based payment links.

---

## Current Implementation Status

### Completed

| Component | Status | Files |
|-----------|--------|-------|
| Database schemas | Done | `database/schema/*.schema.ts` |
| Invoice repository | Done | `database/queries/invoices.repository.ts` |
| Billing transactions repository | Done | `database/queries/billing-transactions.repository.ts` |
| Invoice types | Done | `types/invoices.types.ts` |
| Validation schemas | Done | `schemas/invoices.validation.ts` |
| Invoice service (CRUD + send + sync) | Done | `services/invoices.service.ts` |
| Stripe invoices service | Done | `services/stripe-invoices.service.ts` |
| Invoice webhooks service | Done | `services/invoice-webhooks.service.ts` |
| Payment links service | Done | `services/payment-links.service.ts` |
| Route definitions (OpenAPI) | Done | `routes.ts` |
| Handlers | Done | `handlers.ts` |
| HTTP router | Done | `http.ts` |
| Module index | Done | `index.ts` |
| Matters retainer_balance column | Done | `matters.schema.ts:55` |

### Not Yet Working

| Issue | Reason |
|-------|--------|
| ~~**API endpoints not accessible**~~ | ~~Module not registered in `modules.generated.ts`~~ ✅ Fixed |
| ~~**Void invoice endpoint missing**~~ | ~~Route defined but not implemented~~ ✅ Fixed |
| ~~**Retainer balance not updated on payment**~~ | ~~Logic not in webhook handler~~ ✅ Fixed |
| **Invoice events not dispatched** | Events not pushed to `events` table for audit/logging |
| **Tests incomplete** | Only basic `createInvoice` test exists |

---

## Remaining Tasks

### 1. Register Module (Critical - Blocking) ✅ DONE

**Problem:** The invoices module is not mounted because `pnpm build` hasn't been run since the module was created.

**Action:**
```bash
pnpm build
```

**Status:** ✅ Completed - `modules.generated.ts` now includes `invoicesHttp`

---

### 2. Create routes.config.ts for Invoices Module ✅ DONE

**File:** `src/modules/invoices/routes.config.ts`

**Status:** ✅ Completed - File exists with `requireAuth` middleware

---

### 3. Remove Token-Based Payment Flow (Simplification) ✅ DONE

**Status:** ✅ Completed
- `sendInvoice()` no longer creates payment links
- Uses `stripe_hosted_invoice_url` from Stripe response
- Payment links service/routes still exist but are unused (optional cleanup)

---

### 4. Add Void Invoice API Endpoint ✅ DONE

**Status:** ✅ Completed
- Route defined in `routes.ts`
- Handler in `handlers.ts`
- Service method in `invoices.service.ts`
- Registered in `http.ts`

---

### 5. Implement Retainer Balance Update Logic ✅ DONE

**Status:** ✅ Completed
- `invoice-webhooks.service.ts` deducts from retainer on `invoice.paid`
- Uses `mattersQueries.updateRetainerBalance()`
- Checks `invoice.payment_from_retainer` flag

---

### 6. Add Invoice Events to Event System

**Problem:** The invoices module does not dispatch events to the `events` table. Other modules (matters, payments, user_details) dispatch events for audit logging and downstream processing, but invoices is missing.

#### 6.1 Add Event Definitions
**File:** `src/shared/events/definitions.ts`

Add these event classes:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// INVOICE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class InvoiceCreated extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  client_id: string;
  matter_id: string;
  invoice_number: string;
  total: number;
}> {
  static type = 'invoice.created' as const;
}

export class InvoiceUpdated extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  changes: Record<string, unknown>;
}> {
  static type = 'invoice.updated' as const;
}

export class InvoiceSent extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  client_id: string;
  stripe_invoice_id: string;
  stripe_hosted_invoice_url: string;
  total: number;
}> {
  static type = 'invoice.sent' as const;
}

export class InvoicePaid extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  matter_id: string | null;
  stripe_invoice_id: string;
  amount_paid: number;
  retainer_deducted: boolean;
  retainer_amount_deducted?: number;
}> {
  static type = 'invoice.paid' as const;
}

export class InvoicePaymentFailed extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  stripe_invoice_id: string;
}> {
  static type = 'invoice.payment_failed' as const;
}

export class InvoiceVoided extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  stripe_invoice_id: string | null;
  voided_by: 'user' | 'webhook';
}> {
  static type = 'invoice.voided' as const;
}

export class InvoiceDeleted extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  deleted_by: 'user' | 'webhook';
}> {
  static type = 'invoice.deleted' as const;
}
```

Also add to `EventClasses` map:

```typescript
// Invoice
'invoice.created': InvoiceCreated,
'invoice.updated': InvoiceUpdated,
'invoice.sent': InvoiceSent,
'invoice.paid': InvoicePaid,
'invoice.payment_failed': InvoicePaymentFailed,
'invoice.voided': InvoiceVoided,
'invoice.deleted': InvoiceDeleted,
```

#### 6.2 Dispatch Events in Invoice Service
**File:** `src/modules/invoices/services/invoices.service.ts`

| Method | Event to Dispatch | Actor Type |
|--------|-------------------|------------|
| `createInvoice()` | `InvoiceCreated.dispatch(...)` | `user` |
| `updateInvoice()` | `InvoiceUpdated.dispatch(...)` | `user` |
| `sendInvoice()` | `InvoiceSent.dispatch(...)` | `user` |
| `voidInvoice()` | `InvoiceVoided.dispatch(...)` | `user` |
| `deleteInvoice()` | `InvoiceDeleted.dispatch(...)` | `user` |

Example for `createInvoice()`:
```typescript
import { InvoiceCreated } from '@/shared/events/definitions';

// After successful creation, inside the transaction:
await InvoiceCreated.dispatch({
  invoice_id: newInvoice.id,
  organization_id: organizationId,
  client_id: data.client_id,
  matter_id: data.matter_id,
  invoice_number: newInvoice.invoice_number,
  total: totals.total,
}, {
  actorId: user.id,
  actorType: 'user',
  organizationId,
  tx, // Transactional dispatch
});
```

#### 6.3 Dispatch Events in Webhook Service
**File:** `src/modules/invoices/services/invoice-webhooks.service.ts`

| Handler | Event to Dispatch | Actor Type |
|---------|-------------------|------------|
| `handleInvoicePaid()` | `InvoicePaid.dispatch(...)` | `webhook` |
| `handleInvoicePaymentFailed()` | `InvoicePaymentFailed.dispatch(...)` | `webhook` |
| `handleInvoiceVoided()` | `InvoiceVoided.dispatch(...)` | `webhook` |
| `handleInvoiceDeleted()` | `InvoiceDeleted.dispatch(...)` | `webhook` |

Example for `handleInvoicePaid()`:
```typescript
import { InvoicePaid } from '@/shared/events/definitions';

// After updating invoice and billing transaction, inside the transaction:
await InvoicePaid.dispatch({
  invoice_id: invoice.id,
  organization_id: invoice.organization_id,
  matter_id: invoice.matter_id,
  stripe_invoice_id: stripeInvoice.id,
  amount_paid: stripeInvoice.amount_paid,
  retainer_deducted: !!invoice.payment_from_retainer,
  retainer_amount_deducted: invoice.payment_from_retainer ? stripeInvoice.amount_paid : undefined,
}, {
  actorId: 'webhook',
  actorType: 'webhook',
  organizationId: invoice.organization_id,
  tx, // Transactional dispatch
  critical: true, // Ensure persistence before response
});
```

#### 6.4 Event Dispatch Options

| Scenario | Dispatch Mode | Usage |
|----------|---------------|-------|
| Inside `db.transaction()` | `{ tx }` | Atomic with business logic |
| Webhook handlers | `{ critical: true }` | Guaranteed persistence |
| Fire-and-forget | `{}` | Non-blocking, eventual persistence |

---

### 7. Add Tests for Invoices Module

#### 6.1 Unit Tests
**File:** `src/modules/invoices/__tests__/invoices.service.test.ts`

Test cases:
- `createInvoice` - creates invoice with line items, calculates totals
- `getInvoiceById` - returns invoice with relations
- `listInvoices` - pagination, filtering by status/client/matter
- `updateInvoice` - only draft invoices can be updated
- `deleteInvoice` - soft delete, only draft invoices
- `sendInvoice` - creates Stripe invoice, updates status
- `voidInvoice` - voids Stripe invoice, updates status
- `syncInvoice` - syncs status from Stripe

#### 6.2 Webhook Tests
**File:** `src/modules/invoices/__tests__/invoice-webhooks.service.test.ts`

Test cases:
- `handleInvoicePaid` - updates status, creates billing transaction, updates retainer
- `handleInvoicePaymentFailed` - updates status to overdue
- `handleInvoiceVoided` - updates status to cancelled
- `handleInvoiceDeleted` - soft deletes invoice

#### 6.3 Integration Tests
**File:** `src/modules/invoices/__tests__/invoices.integration.test.ts`

Test cases:
- Full CRUD flow via HTTP endpoints
- Authorization checks (can't access other org's invoices)
- Send invoice flow with Stripe (test mode)

---

## Implementation Order

```
1. pnpm build                           <- Unblocks everything
2. Create routes.config.ts              <- Module config
3. Remove payment link creation         <- Simplify to Stripe hosted pages
4. Add void invoice endpoint            <- Complete CRUD
5. Add retainer balance logic           <- Business requirement
6. Add invoice events to event system   <- Audit logging & downstream processing
7. Add tests                            <- Quality assurance
8. Manual testing with Stripe test mode <- E2E verification
```

---

## API Endpoints Summary (After Changes)

### Protected Routes (require auth)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/{practice_id}/invoices` | Create invoice | Done |
| GET | `/{practice_id}/invoices` | List invoices | Done |
| GET | `/{practice_id}/invoices/{id}` | Get invoice | Done |
| PATCH | `/{practice_id}/invoices/{id}` | Update draft invoice | Done |
| DELETE | `/{practice_id}/invoices/{id}` | Soft delete draft invoice | Done |
| POST | `/{practice_id}/invoices/{id}/send` | Send invoice (returns `stripe_hosted_invoice_url`) | Done |
| POST | `/{practice_id}/invoices/{id}/void` | Void invoice | **TODO** |
| POST | `/{practice_id}/invoices/{id}/sync` | Sync with Stripe | Done |

### Public Routes

**None required** - Clients pay via `stripe_hosted_invoice_url` which is Stripe's hosted page.

---

## Payment Flow (Simplified)

```
1. Lawyer creates invoice (POST /invoices)
2. Lawyer sends invoice (POST /invoices/{id}/send)
   - Creates Stripe Invoice on connected account
   - Finalizes and sends email via Stripe
   - Returns stripe_hosted_invoice_url
3. Client receives email from Stripe with payment link
4. Client pays on Stripe's hosted invoice page
5. Stripe fires invoice.paid webhook
6. Webhook handler:
   - Updates invoice status to 'paid'
   - Creates billing_transaction record
   - Updates matter retainer_balance (if applicable)
7. Done - no custom payment UI needed
```

---

## Files to Modify

| File | Change |
|------|--------|
| `services/invoices.service.ts` | Remove payment link creation, add voidInvoice, dispatch events |
| `services/invoice-webhooks.service.ts` | Add retainer balance update, dispatch events |
| `routes.ts` | Add voidInvoiceRoute, optionally remove getPublicInvoiceRoute |
| `handlers.ts` | Add voidInvoiceHandler, optionally remove getPublicInvoiceHandler |
| `http.ts` | Register voidInvoice route |
| `routes.config.ts` | Create new file |
| `matters.repository.ts` | Add updateRetainerBalance method |
| `src/shared/events/definitions.ts` | Add invoice event classes (InvoiceCreated, InvoiceSent, InvoicePaid, etc.) |

---

## Verification Checklist

- [ ] `pnpm build` completes without errors
- [ ] `modules.generated.ts` includes invoices module
- [ ] `GET /api/invoices/{practice_id}/invoices` returns 200
- [ ] Create invoice flow works end-to-end
- [ ] Send invoice returns `stripe_hosted_invoice_url`
- [ ] Void invoice works for sent invoices
- [ ] Webhook `invoice.paid` updates status and creates transaction
- [ ] Retainer balance updates correctly on payment
- [ ] Invoice events are dispatched to `events` table:
  - [ ] `invoice.created` on create
  - [ ] `invoice.updated` on update
  - [ ] `invoice.sent` on send
  - [ ] `invoice.paid` on webhook
  - [ ] `invoice.voided` on void
  - [ ] `invoice.deleted` on delete
- [ ] All tests pass

---

## Notes

### Why Stripe Hosted Pages?

1. **Security** - PCI compliance handled by Stripe
2. **UX** - Professional, mobile-optimized payment UI
3. **Simplicity** - No custom payment form to build/maintain
4. **Features** - Automatic reminders, receipts, payment methods
5. **Trust** - Clients see Stripe's familiar payment page

### Stripe Direct Charges Model

This module uses Direct Charges (`stripeAccount` header) which means:
- Payments go directly to the connected account
- Stripe takes their fee from the connected account
- Platform can set `application_fee_amount` if needed
- No transfers needed - funds are already in the right place
