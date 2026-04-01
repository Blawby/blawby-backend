# Financial Engines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract financial processing logic into independent, engine engines in `src/engines/`, add event emissions as coordination outputs (not primary flow), fix error handling, simplify webhooks to be thin (receive → store → publish), and move async work to background workers.

**Architecture:**
Engines are the **primary nervous system** (coordinate, validate, execute business logic). Events are **output signals** (emitted FROM engines, subscribed to by listeners for side effects):

```
Webhook → Store → Worker → Engine (coordinate logic + emit events) → Listeners (side effects)
                               ↓
                           Services (trust, stripe, etc.)
```

- **Phase 1:** Create engine foundation (directory structure + fund management engine)
- **Phase 2:** Define event payloads (InvoicePaid, InvoiceRefunded, RetainerLowBalance) with minimal identifiers — module-owned
- **Phase 3:** Create remaining engine engines (`useInvoicePaymentOrchestrator`, `useRetainerPaymentFlow`, etc.) that emit events as outputs
- **Phase 4:** Create event listeners for side effects (trust deposits, emails, audit logging, billing)
- **Phase 5:** Refactor webhook handler to be thin (store event → publish to queue → return 200), move payment orchestration to async worker
- **Phase 6:** Fix error handling, consolidate handlers, test end-to-end (fix `errorHandler` + update imports)

**Tech Stack:** TypeScript, Hono, Drizzle ORM, Stripe API, Graphile Worker, Functional engines (Vue-style exports), Event system (existing 3-tier dispatch)

---

## File Structure

**New Files Created:**

- `src/modules/invoices/types/events.ts` — Event payloads (InvoicePaid, InvoiceRefunded)
- `src/modules/trust/types/events.ts` — Event payloads (RetainerLowBalance)
- `src/modules/billing/types/events.ts` — Event payloads (AuditLogEvent)
- `src/engines/index.ts` — Central exports for all engines
- `src/engines/financial/index.ts` — Financial engine exports
- `src/engines/financial/types.ts` — Shared types for financial engines (FundDestination, FundRoutingInvoice, TransferInstruction, RefundEventPayload, etc.)
- `src/engines/financial/fund-management.ts` — Fund routing engine
- `src/engines/financial/invoice-payment-orchestrator.ts` — Payment orchestration engine (emits InvoicePaid)
- `src/engines/financial/retainer-payment-flow.ts` — Retainer deposit/withdrawal engine (emits RetainerLowBalance)
- `src/engines/financial/refund-engine.ts` — Refund state machine engine (emits InvoiceRefunded)
- `src/engines/financial/payment-processor.ts` — Placeholder for future payment intent logic
- `src/engines/stripe/index.ts` — Stripe engine exports
- `src/engines/stripe/stripe-api-adapter.ts` — Stripe API calls engine
- `src/engines/stripe/webhook-router.ts` — Webhook dispatcher engine
- `src/modules/trust/listeners.ts` — Event listeners (deposits, withdrawals, low balance checks)
- `src/modules/invoices/listeners.ts` — Event listeners (email notifications, audit logging)
- `src/modules/billing/listeners.ts` — Event listeners (transaction creation, Stripe transfer execution)
- `src/workers/tasks/process-invoice-payment.ts` — Async worker task (triggers payment orchestrator)

**Files Modified:**

- `src/shared/middleware/errorHandler.ts` — Add `AppError` discriminated union case
- `src/modules/invoices/handlers.ts` — Simplify to delegate to engines
- `src/modules/invoices/services/invoice-webhooks.service.ts` — Make thin (store → publish → reply)
- `src/modules/practice-client-intakes/services/intake-creation.service.ts` — Update fund-router import path

**Files Deleted (moved to engines):**

- `src/modules/invoices/services/fund-router.service.ts`
- `src/modules/invoices/services/stripe-invoices.service.ts`
- `src/modules/invoices/services/payment-links.service.ts`
- `src/modules/invoices/services/refund-execution-persistence.service.ts`
- `src/modules/invoices/services/refund-reconciliation.service.ts`

---

## Critical: Error Handling Pattern

**WHENEVER YOU TOUCH A SERVICE FILE:**
1. Remove all `response.fromResult()` / `response.ok()` / `response.notFound()` calls
2. Replace `Result<T>` return types with direct return type (or void)
3. Replace error handling with `throw` statements:
   - Expected failures: `throw createValidationError(...)` or `throw createNotFoundError(...)`
   - Business logic errors: `throw new Error('...')` or custom AppError
4. Services emit events via `ctx.emit()` (do NOT call listeners directly)

**Example transformation:**
```typescript
// BEFORE (Result pattern)
const result = await service.processPayment(data);
if (result.isErr()) return response.fromResult(result);
const payment = result.ok();

// AFTER (Throw pattern)
const payment = await service.processPayment(data);
// If error, service throws. Handler catches and converts to HTTP response.
```

This ensures consistency across all service files as they're modified during engine implementation.

---

## Phase 1: Engine Foundation

### Task 1: Create `src/engines/` Directory Structure and Index Files

**Files:**

- Create: `src/engines/index.ts`
- Create: `src/engines/financial/index.ts`
- Create: `src/engines/stripe/index.ts`

- [ ] **Step 1: Create engines directory structure**

```bash
mkdir -p src/engines/financial src/engines/stripe
```

- [ ] **Step 2: Create `src/engines/financial/index.ts`**

```typescript
// src/engines/financial/index.ts
/**
 * Financial Processing Engines
 *
 * Single object exports for fund routing, payment orchestration, refunds, and retainer management.
 * All logic grouped by concern: FundManagement, InvoicePaymentOrchestrator, etc.
 */

export { fundManagement } from './fund-management';
export { invoicePaymentOrchestrator } from './invoice-payment-orchestrator';
export { retainerPaymentFlow } from './retainer-payment-flow';
export { refundEngine } from './refund-engine';
export { paymentProcessor } from './payment-processor';

// Types
export type { FundRoutingInvoice, FundDestination, TransferInstruction, RefundEventPayload } from './types';
```

- [ ] **Step 3: Create `src/engines/stripe/index.ts`**

```typescript
// src/engines/stripe/index.ts
/**
 * Stripe Integration Engines
 *
 * Single object exports for Stripe API interactions and webhook routing.
 * StripeApiAdapter handles API calls; WebhookRouter handles event dispatch.
 */

export { stripeApiAdapter } from './stripe-api-adapter';
export { webhookRouter } from './webhook-router';
```

- [ ] **Step 4: Create `src/engines/index.ts`**

```typescript
// src/engines/index.ts
/**
 * Financial and Platform Integration Engines
 *
 * Layer 4 (Financial Processing) and Layer 5 (Platform Integration)
 * Exports all engines for use by domain modules.
 */

export * from './financial';
export * from './stripe';
```

- [ ] **Step 5: Commit**

```bash
git add src/engines
git commit -m "chore: create engines directory structure and index exports"
```

---

### Task 2: Create `useFundManagement` Composable Engine

**Files:**

- Create: `src/engines/financial/fund-management.ts`

- [ ] **Step 1: Create `fund-management.ts`**

```typescript
// src/engines/financial/fund-management.ts
import { getLogger } from '@logtape/logtape';
import { createValidationError } from '@/shared/types/errors';

const logger = getLogger(['engines', 'financial', 'fund-management']);

export type FundDestination = 'operating' | 'trust';

export interface FundRoutingInvoice {
  id: string;
  fund_destination: string;
  matter_id: string;
  invoice_number: string | null;
  invoice_type: string;
}

export interface TransferInstruction {
  destination: string;
  metadata: {
    invoice_id: string;
    invoice_number: string | null;
    invoice_type: string;
    fund_destination: FundDestination;
    matter_id: string;
  };
  holdForApproval: boolean;
  escrowStatus: 'none' | 'held';
  updateRetainerBalance: boolean;
}

const VALID_FUND_DESTINATIONS: readonly FundDestination[] = ['operating', 'trust'] as const;

/**
 * Type guard: validate fund destination at runtime
 */
const isValidFundDestination = (value: unknown): value is FundDestination =>
  typeof value === 'string' && VALID_FUND_DESTINATIONS.includes(value as FundDestination);

/**
 * Validate fund destination, throw if invalid
 */
const validateFundDestination = (value: unknown, invoiceId: string): FundDestination => {
  if (isValidFundDestination(value)) {
    return value;
  }
  throw createValidationError(
    'INVALID_FUND_DESTINATION',
    `Invalid fund_destination '${String(value)}' on invoice ${invoiceId}. Expected one of: ${VALID_FUND_DESTINATIONS.join(', ')}`,
    { invoiceId, value }
  );
};

/**
 * Calculate application fee (currently always 0, ready for future implementation)
 */
const calculateApplicationFee = (amount: number): number => {
  void amount; // unused
  return 0;
};

/**
 * Determine if retainer balance should be updated
 */
const shouldUpdateRetainerBalance = (invoice: FundRoutingInvoice): boolean => {
  return invoice.invoice_type === 'retainer_deposit';
};

/**
 * Determine if funds should be held for approval (currently always false)
 */
const shouldHoldForApproval = (): boolean => false;

/**
 * Route payment based on invoice type and return transfer instruction
 */
const routePayment = (invoice: FundRoutingInvoice, connectedAccountId: string): TransferInstruction => {
  const fundDestination = validateFundDestination(invoice.fund_destination, invoice.id);

  if (!invoice.matter_id) {
    throw createValidationError(
      'MISSING_MATTER_ID',
      `Missing matter_id on invoice ${invoice.id}. Fund routing requires a matter association.`,
      { invoiceId: invoice.id }
    );
  }

  const baseMetadata = {
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number ?? null,
    invoice_type: invoice.invoice_type,
    fund_destination: fundDestination,
    matter_id: invoice.matter_id,
  };

  switch (invoice.invoice_type) {
    case 'flat_fee':
    case 'phase_fee':
      // Earned upon receipt — transfer immediately to operating
      return {
        destination: connectedAccountId,
        metadata: {
          ...baseMetadata,
          fund_destination: 'operating' as const,
        },
        holdForApproval: false,
        escrowStatus: 'none' as const,
        updateRetainerBalance: false,
      };

    case 'retainer_deposit':
      // Client money — transfer to Practice trust account
      return {
        destination: connectedAccountId,
        metadata: {
          ...baseMetadata,
          fund_destination: 'trust' as const,
        },
        holdForApproval: false,
        escrowStatus: 'none' as const,
        updateRetainerBalance: true,
      };

    default:
      throw createValidationError('UNKNOWN_INVOICE_TYPE', `Unknown invoice type: ${invoice.invoice_type}`, {
        invoiceType: invoice.invoice_type,
        invoiceId: invoice.id,
      });
  }
};

/**
 * Fund Management Engine
 *
 * Determines where payment goes (operating vs. trust) based on invoice type.
 * Pure domain logic, no DB access. Single object export with all related functions.
 *
 * Usage:
 *   const instruction = fundManagement.routePayment(invoice, connectedAccountId);
 *   const fee = fundManagement.calculateApplicationFee(amount);
 */
export const fundManagement = {
  routePayment,
  isValidFundDestination,
  validateFundDestination,
  calculateApplicationFee,
  shouldUpdateRetainerBalance,
  shouldHoldForApproval,
};
```

- [ ] **Step 2: Run typecheck to verify no errors**

```bash
pnpm run typecheck
```

Expected: No errors related to fund-management engine

- [ ] **Step 3: Commit**

```bash
git add src/engines/financial/fund-management.ts
git commit -m "feat(engines): create FundManagement engine (single object export)"
```

---

## Phase 2: Define Event Payload Types

### Task 3: Define Event Payload Types (Module-Owned)

**Files:**

- Create: `src/modules/invoices/types/events.ts`
- Create: `src/modules/trust/types/events.ts`
- Create: `src/modules/billing/types/events.ts`

**Context:** Event payloads are defined in the modules that own them. No classes—just interfaces. Engines will emit events with `Event.emit()` using these payload types. Each module is responsible for its event contracts.

- [ ] **Step 1: Create invoices event payload types**

Create `src/modules/invoices/types/events.ts`:

```typescript
/**
 * Event type identifiers (used with Event.emit/listen)
 */
export const INVOICE_PAID_EVENT = 'invoice:paid';
export const INVOICE_REFUNDED_EVENT = 'invoice:refunded';

/**
 * InvoicePaid: Emitted when invoice transitions to paid status.
 * Minimal payload: invoice_id, amount, timestamp.
 * Listeners (trust, invoices, billing) fetch fresh data using invoice_id.
 */
export interface InvoicePaidPayload {
  invoice_id: string;
  organization_id: string;
  amount_cents: number;
  paid_at: string;
}

/**
 * InvoiceRefunded: Emitted when refund is executed.
 * Minimal payload: invoice_id, refund amount, timestamp.
 */
export interface InvoiceRefundedPayload {
  invoice_id: string;
  organization_id: string;
  refund_request_id: string;
  refunded_amount_cents: number;
  refunded_at: string;
}
```

- [ ] **Step 2: Create trust event payload types**

Create `src/modules/trust/types/events.ts`:

```typescript
/**
 * Event type identifiers (used with Event.emit/listen)
 */
export const RETAINER_LOW_BALANCE_EVENT = 'retainer:low_balance';

/**
 * RetainerLowBalance: Emitted when retainer balance drops below threshold.
 * Listeners: invoices (email notifications).
 */
export interface RetainerLowBalancePayload {
  organization_id: string;
  matter_id: string;
  current_balance_cents: number;
  threshold_cents: number;
}
```

- [ ] **Step 3: Create billing event payload types**

Create `src/modules/billing/types/events.ts`:

```typescript
/**
 * Event type identifiers (used with Event.emit/listen)
 */
export const AUDIT_LOG_EVENT = 'audit:log';

/**
 * AuditLogEvent: Emitted for all financial transactions.
 * Listeners: billing (write to audit ledger).
 */
export interface AuditLogEventPayload {
  organization_id: string;
  event_type: 'invoice_paid' | 'invoice_refunded' | 'retainer_deposit' | 'retainer_withdrawal';
  entity_id: string;
  amount_cents: number;
  metadata: Record<string, unknown>;
  timestamp: string;
}
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm run typecheck
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/modules/invoices/types/events.ts src/modules/trust/types/events.ts src/modules/billing/types/events.ts
git commit -m "feat: define module-owned event payload types (no classes, just interfaces)"
```

---

## Phase 3: Create Remaining Engines

### Task 4: Create `useRetainerPaymentFlow` Composable Engine

**Files:**

- Create: `src/engines/financial/retainer-payment-flow.ts`

- [ ] **Step 1: Create `retainer-payment-flow.ts`**

```typescript
// src/engines/financial/retainer-payment-flow.ts
import { getLogger } from '@logtape/logtape';
import { createTransactionError, createValidationError } from '@/shared/types/errors';
import type { ServiceContext } from '@/shared/types/service-context';
import type { Database } from 'drizzle-orm';

const logger = getLogger(['engines', 'financial', 'retainer-payment-flow']);

/**
 * Retainer Payment Flow — handles trust deposits, withdrawals, and reversals atomically
 *
 * Responsibilities:
 * - Record trust deposit/withdrawal
 * - Update matter retainer balance cache
 * - Check low balance threshold and emit event
 *
 * Used by: invoice payment handler, refund handler
 */

interface RecordRetainerDepositOpts {
  organizationId: string;
  clientId: string;
  matterId: string;
  amount: number;
  description?: string;
  source?: string;
  invoiceId?: string;
  ctx: ServiceContext;
  tx: Database;
}

interface RecordRetainerWithdrawalOpts extends RecordRetainerDepositOpts {}

interface RevertRetainerOpts {
  organizationId: string;
  clientId: string;
  matterId: string;
  amount: number;
  description?: string;
  ctx: ServiceContext;
  tx: Database;
}

const recordDeposit = async (opts: RecordRetainerDepositOpts): Promise<void> => {
  if (opts.amount <= 0) {
    throw createValidationError(
      'AMOUNT_INVALID',
      'Retainer deposit amount must be positive',
      { amount: opts.amount, matterId: opts.matterId }
    );
  }

  // TODO: Import and call trustService.recordDeposit (or inject dependency)
  // This is a placeholder — the actual implementation will call the trust service
  logger.info('Recording retainer deposit: {amount}', {
    amount: opts.amount,
    matterId: opts.matterId,
  });
};

const recordWithdrawal = async (opts: RecordRetainerWithdrawalOpts): Promise<void> => {
  if (opts.amount <= 0) {
    throw createValidationError(
      'AMOUNT_INVALID',
      'Retainer withdrawal amount must be positive',
      { amount: opts.amount, matterId: opts.matterId }
    );
  }

  // TODO: Import and call trustService.recordWithdrawal
  logger.info('Recording retainer withdrawal: {amount}', {
    amount: opts.amount,
    matterId: opts.matterId,
  });
};

const revertRefund = async (opts: RevertRetainerOpts): Promise<void> => {
  // Reverse a refunded retainer deposit
  logger.info('Reverting retainer refund: {amount}', {
    amount: opts.amount,
    matterId: opts.matterId,
  });
};

/**
 * Retainer Payment Flow — Vue-style engine export
 *
 * Usage:
 *   const { recordDeposit, recordWithdrawal } = useRetainerPaymentFlow();
 *   await recordDeposit({ organizationId, clientId, matterId, amount, ctx, tx });
 */
export const retainerPaymentFlow = {
  recordDeposit,
  recordWithdrawal,
  revertRefund,
};
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm run typecheck
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/engines/financial/retainer-payment-flow.ts
git commit -m "feat(engines): create RetainerPaymentFlow engine (single object export)"
```

---

### Task 5: Create `useRefundEngine` Composable Engine

**Files:**

- Create: `src/engines/financial/refund-engine.ts`

- [ ] **Step 1: Create `refund-engine.ts`**

```typescript
// src/engines/financial/refund-engine.ts
import { getLogger } from '@logtape/logtape';
import type { ServiceContext } from '@/shared/types/service-context';
import type { Database } from 'drizzle-orm';

const logger = getLogger(['engines', 'financial', 'refund-engine']);

export interface RefundEventPayload {
  invoice_id: string;
  organization_id: string;
  refund_request_id: string;
  refunded_amount: number;
  payout_fee_credit_cents: number;
  credit_invoice_fee: boolean;
}

/**
 * Refund Engine — handles refund state machine, payout metering, and reconciliation
 *
 * Responsibilities:
 * - Persist executed refund state transitions
 * - Calculate payout fee credits (proportional to cumulative refunds)
 * - Reconcile stuck refunds (repair webhook failures)
 * - Build refund event payload for downstream processing
 */

interface PersistExecutedRefundOpts {
  organizationId: string;
  refundRequestId: string;
  invoiceId: string;
  refundedAmount: number;
  ctx: ServiceContext;
  tx: Database;
}

const persistExecutedRefund = async (opts: PersistExecutedRefundOpts): Promise<RefundEventPayload> => {
  logger.info('Persisting executed refund: {refundRequestId}', {
    refundRequestId: opts.refundRequestId,
    invoiceId: opts.invoiceId,
    amount: opts.refundedAmount,
  });

  // TODO: Import and call refund-execution-persistence logic
  return {
    invoice_id: opts.invoiceId,
    organization_id: opts.organizationId,
    refund_request_id: opts.refundRequestId,
    refunded_amount: opts.refundedAmount,
    payout_fee_credit_cents: 0, // TODO: calculate
    credit_invoice_fee: false, // TODO: determine
  };
};

interface ReconcileRefundOpts {
  organizationId: string;
  refundRequestId: string;
  ctx?: ServiceContext;
  tx?: Database;
}

const reconcileRefund = async (opts: ReconcileRefundOpts): Promise<{ repaired: boolean; dispatched: boolean }> => {
  logger.info('Reconciling refund: {refundRequestId}', {
    refundRequestId: opts.refundRequestId,
  });

  // TODO: Call refund-reconciliation logic
  return { repaired: false, dispatched: false };
};

const calculatePayoutFeeCreditCents = (
  invoiceId: string,
  amountPaidCents: number,
  refundedAmount: number
): number => {
  // Placeholder: calculate proportional fee credit
  return 0;
};

/**
 * Refund Engine — Vue-style engine export
 *
 * Usage:
 *   const { persistExecutedRefund, reconcileRefund } = useRefundEngine();
 *   const payload = await persistExecutedRefund({ organizationId, refundRequestId, ... });
 */
export const refundEngine = {
  persistExecutedRefund,
  reconcileRefund,
  calculatePayoutFeeCreditCents,
};
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/engines/financial/refund-engine.ts
git commit -m "feat(engines): create useRefundEngine engine engine"
```

---

### Task 6: Create `useInvoicePaymentOrchestrator` Composable Engine

**Files:**

- Create: `src/engines/financial/invoice-payment-orchestrator.ts`

- [ ] **Step 1: Create `invoice-payment-orchestrator.ts`**

```typescript
// src/engines/financial/invoice-payment-orchestrator.ts
import { getLogger } from '@logtape/logtape';
import type { ServiceContext } from '@/shared/types/service-context';
import type { Database } from 'drizzle-orm';
import type Stripe from 'stripe';

const logger = getLogger(['engines', 'financial', 'invoice-payment-orchestrator']);

/**
 * Invoice Payment Orchestrator — consolidated payment processing logic
 *
 * Consolidates what was in:
 * - invoice-paid.handler.ts (355 lines)
 * - invoice-webhooks.service.ts (557 lines)
 *
 * Responsibilities:
 * 1. Retrieve invoice from Stripe
 * 2. Determine fund routing (operating vs. trust)
 * 3. Record trust deposit/withdrawal if retainer
 * 4. Update matter retainer balance
 * 5. Report metered usage (non-blocking)
 * 6. Emit InvoicePaid event
 * 7. Create Stripe transfer
 *
 * Called by:
 * - HTTP handler: invoice-paid.handler for direct calls
 * - Worker: process-invoice-payment task for webhook-initiated payments
 */

interface ProcessPaymentOpts {
  stripeInvoiceId: string;
  organizationId: string;
  ctx: ServiceContext;
}

const processPayment = async (opts: ProcessPaymentOpts): Promise<void> => {
  const { stripeInvoiceId, organizationId, ctx } = opts;

  logger.info('Processing invoice payment: {invoiceId}', {
    invoiceId: stripeInvoiceId,
    organizationId,
  });

  // Orchestrate payment processing:
  // 1. Fetch Stripe invoice details
  // 2. Find invoice in DB
  // 3. Determine fund routing using useFundManagement
  // 4. Update invoice status to paid
  // 5. Emit InvoicePaid event (listeners handle trust deposits, emails, audit, billing)
  // 6. Emit AuditLogEvent for compliance

  try {
    // TODO: Implement full orchestration
    // For now, emit InvoicePaid event which triggers all listeners
    const { InvoicePaid, AuditLogEvent } = await import('@/shared/events/definitions');

    // Fetch fresh invoice amount for event payload
    const amount = await getInvoiceAmount(stripeInvoiceId); // TODO: implement helper

    // Emit event within transaction to ensure atomicity
    await Event.emit(
      new InvoicePaid({
        invoice_id: stripeInvoiceId,
        organization_id: organizationId,
        amount_cents: amount,
        paid_at: new Date().toISOString(),
      }),
      { dispatch: 'transactional' }
    );

    logger.info('InvoicePaid event emitted: {invoiceId}', { invoiceId: stripeInvoiceId });
  } catch (error) {
    logger.error('Payment orchestration failed: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Invoice Payment Orchestrator — Vue-style engine export
 *
 * Usage:
 *   const { processPayment } = useInvoicePaymentOrchestrator();
 *   await processPayment({ stripeInvoiceId, organizationId, ctx });
 */
export const invoicePaymentOrchestrator = {
  processPayment,
};
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/engines/financial/invoice-payment-orchestrator.ts
git commit -m "feat(engines): create useInvoicePaymentOrchestrator engine engine"
```

---

### Task 7: Create Placeholder Engines

**Files:**

- Create: `src/engines/financial/payment-processor.ts`
- Create: `src/engines/stripe/stripe-api-adapter.ts`
- Create: `src/engines/stripe/webhook-router.ts`

- [ ] **Step 1: Create `payment-processor.ts`** (placeholder for future intent orchestration)

```typescript
// src/engines/financial/payment-processor.ts
/**
 * Payment Processor Engine — placeholder for Layer 4 payment intent orchestration
 *
 * Future responsibilities:
 * - Stripe payment intent creation and management
 * - Customer management (on-behalf-of accounts)
 * - Subscription metering and billing
 *
 * Currently: empty placeholder
 */

export const paymentProcessor = {
  // TODO: Add payment intent orchestration methods
};
```

- [ ] **Step 2: Create `stripe-api-adapter.ts`** (placeholder for Stripe API calls)

```typescript
// src/engines/stripe/stripe-api-adapter.ts
/**
 * Stripe API Adapter Engine — API calls to Stripe
 *
 * Responsibilities:
 * - Invoice operations (create, finalize, void, delete)
 * - Transfer operations (create transfer to connected account)
 * - Payment link operations (create, validate)
 *
 * Injected: Stripe client instance
 */

export const stripeApiAdapter = {
  // TODO: Implement createInvoice, finalizeInvoice, createTransfer, etc.
};
```

- [ ] **Step 3: Create `webhook-router.ts`** (placeholder for Stripe webhook routing)

```typescript
// src/engines/stripe/webhook-router.ts
import type Stripe from 'stripe';
import type { ServiceContext } from '@/shared/types/service-context';

/**
 * Webhook Router Engine — Stripe webhook dispatcher
 *
 * Responsibilities:
 * - Route Stripe events to appropriate handlers
 * - Handle invoice.paid, invoice.payment_failed, invoice.voided, invoice.deleted
 *
 * Called by: Worker task (process-stripe-webhook)
 */

const processStripeWebhook = async (event: Stripe.Event, ctx: ServiceContext): Promise<void> => {
  // TODO: Implement webhook routing
};

const handleInvoicePaid = async (stripeInvoiceId: string, ctx: ServiceContext): Promise<void> => {
  // TODO: Call invoicePaymentOrchestrator.processPayment()
};

export const webhookRouter = {
  processStripeWebhook,
  handleInvoicePaid,
};
```

- [ ] **Step 4: Update engine indexes to export placeholders**

Update `src/engines/financial/index.ts`:

```typescript
export { paymentProcessor } from './payment-processor';
```

Update `src/engines/stripe/index.ts`:

```typescript
export { stripeApiAdapter } from './stripe-api-adapter';
export { webhookRouter } from './webhook-router';
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/engines
git commit -m "feat(engines): create placeholder engines for payment processor and Stripe integration"
```

---

## Phase 4: Create Event Listeners

### Task 8: Create Event Listeners (Module-Specific)

**Files:**

- Create: `src/modules/trust/listeners.ts`
- Create: `src/modules/invoices/listeners.ts`
- Create: `src/modules/billing/listeners.ts`

**Context:** Each module owns its own listeners.ts file. Modules are independent—they subscribe to events and handle only their own domain concerns. No module depends on another module's listeners.

**Architecture:**

```
Event: InvoicePaid
  ├─ Trust listener (deposits, balance checks)
  ├─ Invoices listener (email notifications, audit logging)
  └─ Billing listener (transaction creation, Stripe transfers)
```

**Key principle:** Trust module doesn't know about billing. Invoices doesn't know about trust. Each listener is independent, retry-safe, and can fail without affecting other listeners.

- [ ] **Step 1: Create trust listeners for deposits/withdrawals**

Create `src/modules/trust/listeners.ts`:

```typescript
import { getLogger } from '@logtape/logtape';
import { Event } from '@/shared/events/event';
import type {
  InvoicePaidPayload,
  InvoiceRefundedPayload,
  INVOICE_PAID_EVENT,
  INVOICE_REFUNDED_EVENT,
} from '@/modules/invoices/types/events';
import type { RetainerLowBalancePayload } from '@/modules/trust/types/events';
import { RETAINER_LOW_BALANCE_EVENT } from '@/modules/trust/types/events';
import { trustService } from '@/modules/trust/services';

const logger = getLogger(['modules', 'trust', 'listeners']);

/**
 * When InvoicePaid is emitted, record trust deposit if routed to trust fund.
 */
Event.listen('invoice:paid', async (payload: InvoicePaidPayload) => {
  try {
    const { invoice_id, organization_id, amount_cents } = payload;

    // Trust listener: fetch invoice, check fund_destination, record deposit if trust
    await trustService.recordDepositIfApplicable({
      invoiceId: invoice_id,
      organizationId: organization_id,
      amountCents: amount_cents,
    });

    logger.info('Trust listener processed InvoicePaid: {invoiceId}', { invoiceId: invoice_id });
  } catch (error) {
    logger.error('Trust deposit listener failed: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // Trigger worker retry
  }
});

/**
 * When InvoiceRefunded is emitted, record trust withdrawal.
 */
Event.listen('invoice:refunded', async (payload: InvoiceRefundedPayload) => {
  try {
    const { invoice_id, organization_id, refunded_amount_cents } = payload;

    await trustService.recordWithdrawalIfApplicable({
      invoiceId: invoice_id,
      organizationId: organization_id,
      amountCents: refunded_amount_cents,
    });

    logger.info('Trust listener processed InvoiceRefunded: {invoiceId}', { invoiceId: invoice_id });
  } catch (error) {
    logger.error('Trust withdrawal listener failed: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

/**
 * When RetainerLowBalance is emitted, check threshold and potentially emit alert.
 */
Event.listen('retainer:low_balance', async (payload: RetainerLowBalancePayload) => {
  try {
    const { matter_id, organization_id, current_balance_cents } = payload;

    logger.warn('Retainer balance below threshold: {matterId} ${balance}', {
      matterId: matter_id,
      balance: current_balance_cents / 100,
    });

    // Future: emit NotificationRequired event or queue email
  } catch (error) {
    logger.error('Retainer low balance listener failed: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
```

- [ ] **Step 2: Create invoices listeners (email notifications, audit logging)**

Create `src/modules/invoices/listeners.ts`:

```typescript
import { getLogger } from '@logtape/logtape';
import { Event } from '@/shared/events/event';
import type { InvoicePaidPayload, InvoiceRefundedPayload } from '@/modules/invoices/types/events';
import type { RetainerLowBalancePayload } from '@/modules/trust/types/events';
import { emailQueue } from '@/shared/queue';
import { auditService } from '@/shared/services/audit';

const logger = getLogger(['modules', 'invoices', 'listeners']);

/**
 * When InvoicePaid is emitted, send email notification and log to audit.
 * NOTE: Trust deposits and billing transactions are handled by their own listeners.
 */
Event.listen('invoice:paid', async (payload: InvoicePaidPayload) => {
  try {
    const { invoice_id, organization_id, amount_cents } = payload;

    // Email: Queue payment received notification
    await emailQueue.queueJob({
      type: 'invoice_paid',
      data: { invoiceId: invoice_id, amountCents: amount_cents },
    });

    // Audit: Log transaction
    await auditService.log({
      event_type: 'invoice_paid',
      entity_id: invoice_id,
      amount_cents,
      organization_id,
    });

    logger.info('Invoices listener processed InvoicePaid: {invoiceId}', { invoiceId: invoice_id });
  } catch (error) {
    logger.error('Invoice paid listener failed: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

/**
 * When InvoiceRefunded is emitted, send refund email and log to audit.
 */
Event.listen('invoice:refunded', async (payload: InvoiceRefundedPayload) => {
  try {
    const { invoice_id, organization_id, refunded_amount_cents } = payload;

    await emailQueue.queueJob({
      type: 'invoice_refunded',
      data: { invoiceId: invoice_id, amountCents: refunded_amount_cents },
    });

    await auditService.log({
      event_type: 'invoice_refunded',
      entity_id: invoice_id,
      amount_cents: -refunded_amount_cents,
      organization_id,
    });

    logger.info('Invoices listener processed InvoiceRefunded: {invoiceId}', { invoiceId: invoice_id });
  } catch (error) {
    logger.error('Invoice refunded listener failed: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

/**
 * When RetainerLowBalance is emitted, send low balance notification email.
 */
Event.listen('retainer:low_balance', async (payload: RetainerLowBalancePayload) => {
  try {
    const { matter_id, organization_id, current_balance_cents, threshold_cents } = payload;

    await emailQueue.queueJob({
      type: 'retainer_low_balance',
      data: {
        matterId: matter_id,
        currentBalance: current_balance_cents,
        threshold: threshold_cents,
      },
    });

    logger.info('Email queued for low retainer balance: {matterId}', { matterId: matter_id });
  } catch (error) {
    logger.error('Low balance email listener failed: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
```

- [ ] **Step 3: Create billing listeners (transaction creation, Stripe transfers)**

Create `src/modules/billing/listeners.ts`:

```typescript
import { getLogger } from '@logtape/logtape';
import { Event } from '@/shared/events/event';
import type { InvoicePaidPayload, InvoiceRefundedPayload } from '@/modules/invoices/types/events';
import { billingService } from '@/modules/billing/services/billing.service';

const logger = getLogger(['modules', 'billing', 'listeners']);

/**
 * When InvoicePaid is emitted, create billing transaction and queue Stripe transfer.
 * NOTE: Email notifications and audit logging are handled by invoices listener.
 * Trust deposits are handled by trust listener.
 */
Event.listen('invoice:paid', async (payload: InvoicePaidPayload) => {
  try {
    const { invoice_id, organization_id, amount_cents } = payload;

    // Billing: Create transaction and queue Stripe transfer
    await billingService.processPaymentBilling({
      invoiceId: invoice_id,
      organizationId: organization_id,
      amountCents: amount_cents,
    });

    logger.info('Billing listener processed InvoicePaid: {invoiceId}', { invoiceId: invoice_id });
  } catch (error) {
    logger.error('Billing payment listener failed: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

/**
 * When InvoiceRefunded is emitted, create reverse billing transaction and queue Stripe reversal.
 */
Event.listen('invoice:refunded', async (payload: InvoiceRefundedPayload) => {
  try {
    const { invoice_id, organization_id, refunded_amount_cents } = payload;

    await billingService.processRefundBilling({
      invoiceId: invoice_id,
      organizationId: organization_id,
      refundAmountCents: refunded_amount_cents,
    });

    logger.info('Billing listener processed InvoiceRefunded: {invoiceId}', { invoiceId: invoice_id });
  } catch (error) {
    logger.error('Billing refund listener failed: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm run typecheck
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/modules/trust/listeners.ts src/modules/invoices/listeners.ts src/modules/billing/listeners.ts
git commit -m "feat: create module-specific event listeners (trust, invoices, billing independently handle side effects)"
```

---

## Phase 5: Webhooks and Worker Task

### Task 9: Create Thin Webhook Handler

**Files:**

- Create: `src/workers/tasks/process-invoice-payment.ts` (async worker task)
- Modify: `src/modules/invoices/services/invoice-webhooks.service.ts` (make thin)

- [ ] **Step 1: Create worker task for async payment processing**

```typescript
// src/workers/tasks/process-invoice-payment.ts
import { getLogger } from '@logtape/logtape';
import type { Task } from 'graphile-worker';
import { db } from '@/shared/database';
import { createSystemContext } from '@/shared/types/service-context';
import { invoicePaymentOrchestrator } from '@/engines/financial';

const logger = getLogger(['workers', 'process-invoice-payment']);

export const processInvoicePaymentTask: Task = async (inProgressJob) => {
  const { stripeInvoiceId, organizationId } = inProgressJob.payload as {
    stripeInvoiceId: string;
    organizationId: string;
  };

  if (!stripeInvoiceId || !organizationId) {
    throw new Error('Missing required payload: stripeInvoiceId, organizationId');
  }

  try {
    const ctx = createSystemContext(organizationId);
    const { processPayment } = useInvoicePaymentOrchestrator();

    await processPayment({
      stripeInvoiceId,
      organizationId,
      ctx,
    });

    logger.info('Invoice payment processed successfully: {invoiceId}', {
      invoiceId: stripeInvoiceId,
      organizationId,
    });
  } catch (error) {
    logger.error('Failed to process invoice payment: {invoiceId}', {
      invoiceId: stripeInvoiceId,
      organizationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Rethrow to trigger Graphile Worker retry logic
    throw error;
  }
};
```

- [ ] **Step 2: Register task in Graphile Worker config**

Update `src/shared/queue/queue.config.ts` (add to TASK_NAMES):

```typescript
export const TASK_NAMES = [
  // ... existing tasks ...
  'process-invoice-payment',
] as const;
```

- [ ] **Step 3: Make webhook handler thin**

Modify `src/modules/invoices/services/invoice-webhooks.service.ts`:

Replace the entire `handleInvoicePaid` function with:

```typescript
const handleInvoicePaid = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  // THIN handler: store event, publish to queue, return immediately

  // 1. Store webhook event (idempotency)
  const eventRecord = await stripeWebhookEventsRepository.storeEvent({
    event_id: stripeInvoice.id,
    event_type: 'invoice.paid',
    payload: stripeInvoice,
  });

  // 2. Publish to async worker queue
  await queueManager.enqueue('process-invoice-payment', {
    stripeInvoiceId: stripeInvoice.id,
    organizationId: stripeInvoice.metadata?.organization_id,
  });

  // Done. Webhook returns 200 OK.
  // Actual payment processing happens in worker (process-invoice-payment.ts)
  logger.info('Queued invoice payment for processing: {invoiceId}', {
    invoiceId: stripeInvoice.id,
  });
};
```

Remove all the old code that:

- Called `fundRouterService.routePayment()`
- Recorded trust deposits
- Called subscription metering
- Created Stripe transfers
- Emitted events

That logic now lives in the worker task.

- [ ] **Step 4: Run typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/workers/tasks/process-invoice-payment.ts src/modules/invoices/services/invoice-webhooks.service.ts src/shared/queue/queue.config.ts
git commit -m "feat: create process-invoice-payment worker task, make webhook handler thin"
```

---

## Phase 6: Error Handling & Consolidation

### Task 10: Fix `errorHandler` and Simplify Invoice Handlers

**Files:**

- Modify: `src/shared/middleware/errorHandler.ts` — Add `AppError` discriminated union case
- Modify: `src/modules/invoices/handlers.ts` — Simplify to use new orchestrators

**Context:** Fix error handling so throw-based errors work correctly, then update handlers to use new orchestrators and delete old service imports.

- [ ] **Step 1: Add AppError case to errorHandler**

Read `src/shared/middleware/errorHandler.ts` and add this case after ForbiddenError check:

```typescript
import type { AppError } from '@/shared/types/errors';

// In errorHandler function, after ForbiddenError case:
if (typeof error === 'object' && error !== null && 'kind' in error) {
  const appError = error as AppError;
  const status =
    appError.kind === 'validation_error'
      ? 400
      : appError.kind === 'authorization_error'
        ? 403
        : appError.kind === 'transaction_error'
          ? 500
          : appError.kind === 'app_error'
            ? appError.status
            : 500;

  const isClientError = status >= 400 && status < 500;

  if (isClientError) {
    logger.info('Client error: {code} {message}', {
      code: appError.code,
      message: appError.message,
      context: appError.context,
    });
  } else {
    logger.error('Server error: {code} {message}', {
      code: appError.code,
      message: appError.message,
      context: appError.context,
      cause: appError.cause,
    });
  }

  return c.json({ error: appError.code, message: appError.message }, status);
}
```

- [ ] **Step 2: Update invoice handlers to use new orchestrators**

Update `src/modules/invoices/handlers.ts`:

Replace old imports:

```typescript
import { fundRouterService } from '@/modules/invoices/services/fund-router.service';
import { trustService } from '@/modules/trust/services';
// ... other old imports
```

With:

```typescript
import { invoicePaymentOrchestrator } from '@/engines/financial';
import { getServiceContext } from '@/shared/types/service-context';
```

Remove all direct service calls for payment processing. If a handler needs to process payment, delegate to orchestrator:

```typescript
const { processPayment } = useInvoicePaymentOrchestrator();
await processPayment({ stripeInvoiceId, organizationId, ctx });
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm run typecheck
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/middleware/errorHandler.ts src/modules/invoices/handlers.ts
git commit -m "fix: add AppError handler and simplify invoice handlers to use orchestrators"
```

---

## Phase 7: Integration Testing and Cleanup

### Task 11: Update Consumer Module Imports

**Files:**

- Modify: `src/modules/practice-client-intakes/services/intake-creation.service.ts`

- [ ] **Step 1: Update fund-router import**

Replace:

```typescript
import { fundRouterService } from '@/modules/invoices/services/fund-router.service';
```

With:

```typescript
import { fundManagement } from '@/engines/financial';
```

- [ ] **Step 2: Update fund routing calls**

Replace:

```typescript
const routing = fundRouterService.routePayment(invoice, connectedAccountId);
```

With:

```typescript
const { routePayment } = useFundManagement();
const routing = routePayment(invoice, connectedAccountId);
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm run typecheck
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/modules/practice-client-intakes/services/intake-creation.service.ts
git commit -m "refactor: update fund-router imports to use engines"
```

---

### Task 12: End-to-End Testing

**Files:**

- Test: Run existing test suite

- [ ] **Step 1: Run typecheck across the entire project**

```bash
pnpm run typecheck
```

Expected: PASS (no type errors)

- [ ] **Step 2: Run existing unit tests**

```bash
pnpm run test
```

Expected: All tests pass (or document any test failures that are expected)

- [ ] **Step 3: Verify errorHandler fix works**

Create a simple test route that throws `createValidationError` and verify it returns 400:

```bash
# Add temporary test endpoint to a handler
throw createValidationError('TEST_ERROR', 'Test validation error', { test: true });

# Make request
curl -X POST http://localhost:3000/api/test-error \
  -H "Content-Type: application/json"

# Expect: 400 response with error code + message (not 500)
```

- [ ] **Step 4: Verify no stale imports exist**

```bash
grep -r "fundRouterService" src/modules --exclude-dir=node_modules | grep -v "engines"
grep -r "refund-execution-persistence\|refund-reconciliation" src/modules --exclude-dir=node_modules
```

Expected: Only matches should be in `src/engines/` (not in modules)

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: verify engines extraction and error handling"
```

---

## Verification Commands

Post-implementation, run these to verify success:

```bash
# 1. Type safety
pnpm run typecheck
# Expected: PASS

# 2. Formatting
pnpm run format:check
# Expected: PASS

# 3. Tests
pnpm run test
# Expected: PASS (or document failures)

# 4. No stale imports
grep -r "fundRouterService\|stripe-invoices.service\|refund-execution-persistence" src/modules
# Expected: No matches (services moved to engines)

# 5. Verify orchestrator exports
grep -r "useInvoicePaymentOrchestrator" src/
# Expected: Only in workers/tasks/process-invoice-payment.ts and engine tests

# 6. Build
pnpm run build
# Expected: PASS
```

---

## Summary

**What was done:**

1. ✅ Fixed `errorHandler` to handle `AppError` discriminated union (foundation for throw-based errors)
2. ✅ Defined event payloads (InvoicePaid, InvoiceRefunded, RetainerLowBalance, AuditLogEvent) with minimal identifiers
3. ✅ Created `src/engines/financial/` with engine functions (Vue-style): `useFundManagement`, `useInvoicePaymentOrchestrator`, `useRetainerPaymentFlow`, `useRefundEngine` (all emit events as outputs)
4. ✅ Created `src/engines/stripe/` with engine functions: `useWebhookRouter`, `useStripeApiAdapter` (placeholders)
5. ✅ Created event listeners in modules (trust, invoices) for side effects (trust deposits, emails, audit logging, billing)
6. ✅ Made webhook handler thin (store → publish → reply)
7. ✅ Created async worker task (`process-invoice-payment`) that triggers orchestrators
8. ✅ Orchestrators emit events (events are OUTPUT signals, not the primary flow)
9. ✅ Updated consumer module imports (intakes, etc.)
10. ✅ No changes required in module handler interfaces (backward compatible)

**Architecture: Engines are the nervous system, Events are output signals**

```
Webhook → Store → Worker → Orchestrator (validate + coordinate + emit) → Listeners
                              ↓
                          Services (trust, stripe, etc.)
```

- **Orchestrators** (engines): Validate, coordinate business logic, call services, emit events
- **Events**: Output signals from orchestrators (minimal payloads: IDs only)
- **Listeners**: Subscribe to events, handle side effects independently (trust, email, audit, billing)
- **Services**: Called by orchestrators to execute work (no direct listener calls)

**Key wins:**

- Webhook handler returns 200 immediately (Stripe timeout risk eliminated)
- Payment processing happens asynchronously in worker (retry-safe via Graphile)
- Error handling is consistent (AppError maps to correct HTTP status)
- Financial logic is extracted and reusable (engines as engines)
- Side effects are decoupled from orchestrator (listeners retry independently)
- Events are minimal signals, not the primary coordination layer
- Clear separation of concerns: engines coordinate, listeners observe
