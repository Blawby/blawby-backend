# Billing and Invoices

Status: Implemented with partial automation
Last verified: 2026-07-13

## Purpose

Billing converts approved legal work and expenses into invoices, presents payment options to clients, records payment activity, and preserves a financial audit trail.

## Actors

- Practice owner or billing administrator
- Attorney or staff member
- Client or payer
- Stripe
- Background workers and webhook handlers

## Preconditions

- Practice payment configuration is valid where online payment is required.
- Client and matter records belong to the practice.
- Billable time, expenses, or manual line items are valid and not already billed unless adjustment behavior explicitly permits reuse.

## Core behavior

Implemented capabilities include invoice creation from unbilled work, line-item management, invoice delivery with payment links, Stripe Connect payment processing, refund requests, transaction records, and platform-fee collection.

Saved-payment auto-billing, milestone-triggered invoicing, threshold-triggered invoicing, and automatic retainer replenishment are not complete and must not be presented as active behavior.

## Invoice lifecycle

The exact enum is code-owned, but the product flow must distinguish:

- Draft
- Issued or sent
- Partially paid where supported
- Paid
- Voided, cancelled, or otherwise no longer collectible
- Refunded or adjusted where applicable

Transitions must be validated. Paid invoices must not return to an editable draft state without an explicit adjustment or reversal process.

## Main workflows

### Create invoice

1. Staff selects a client and matter.
2. Backend retrieves eligible unbilled time and expenses.
3. Staff selects entries or adds permitted manual line items.
4. Backend validates ownership, amounts, and billing status.
5. Draft invoice and line items are persisted.

### Send invoice

1. Staff reviews the draft.
2. Backend validates that the invoice is sendable.
3. Invoice becomes issued or sent.
4. Client receives a payment link or portal access.
5. Delivery activity is recorded.

### Record online payment

1. Client initiates payment through Stripe.
2. Stripe sends payment events to the backend.
3. Webhook processing verifies authenticity and idempotency.
4. Billing transactions are recorded.
5. Invoice balances and status are updated.
6. Platform fees and practice settlement data are recorded as applicable.

### Refund

1. Authorized staff requests a refund.
2. Backend validates payment and refundable amount.
3. Stripe refund processing is initiated where applicable.
4. Webhook or direct response confirms the result.
5. Transaction history and invoice balance are updated without deleting the original payment.

## Business rules

- Monetary values must use integer minor units or another consistent decimal-safe representation.
- An unbilled work item cannot be billed twice unless an explicit adjustment flow exists.
- Invoice totals must equal the sum of line items, taxes, discounts, fees, and adjustments according to code-owned formulas.
- Payment and refund events must be idempotent.
- Stripe event order must not cause a paid invoice to regress incorrectly.
- Historical line items and payment transactions must remain auditable.
- Practice and client ownership must be validated for every invoice operation.
- Platform fees must be calculated from the configured policy, not copied from marketing text.

## Permissions

Permissions should distinguish viewing, creating, editing drafts, issuing invoices, requesting refunds, viewing transactions, and changing payment configuration.

Clients may view and pay only invoices associated with their authorized client identity.

## Data ownership

Billing data includes:

- Invoice header and status
- Invoice line items
- Client and matter references
- Source time and expense references
- Payment and refund transactions
- Stripe identifiers
- Platform-fee records
- Delivery and audit metadata

## Side effects

- Client email or notification
- Stripe payment intent, checkout, or connected-account activity
- Webhook jobs
- Billing ledger updates
- Platform-fee accounting
- Trust-accounting integration where client funds are involved

## Failure behavior

- Invalid or cross-practice references: forbidden, not found, or validation error.
- Duplicate webhook: acknowledge safely without duplicate financial effects.
- Stripe failure: preserve a failed or pending transaction record where appropriate.
- Amount mismatch: reject the transition and log the discrepancy.
- Refund exceeding refundable balance: validation error.
- Concurrent payment updates: serialize or otherwise prevent inconsistent balances.

## Known limitations

- Automatic charging of saved payment methods is not complete.
- Automatic invoice generation from milestones or thresholds is not complete.
- Retainer replenishment automation is not complete.
- Exact partial-payment and voiding behavior must be confirmed against current schemas and tests before external publication.

## Acceptance criteria

- Eligible unbilled work can be converted into a correct invoice once.
- Clients can access and pay only their own invoices.
- Duplicate Stripe events do not create duplicate payments or refunds.
- Invoice balances reconcile to immutable transaction history.
- Paid financial history cannot be silently edited or deleted.
- Planned automation is not described as implemented.

## Code ownership

Primary areas:

- `src/modules/invoices/`
- billing transaction and refund services
- `src/modules/stripe/`
- Stripe webhook handlers and workers
- matter time-entry and expense integrations
- trust-accounting integrations
- shared fee services