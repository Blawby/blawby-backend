# Financial Engines True Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move real business logic INTO engine files, delete the old invoice service files that still own the logic, and update all callers so engines are the authoritative source — not wrappers.

**Architecture:** Four old service files (`stripe-invoices`, `refund-execution-persistence`, `refund-reconciliation`, `payment-links`) currently own business logic that belongs in the engine layer. Each engine file is rewritten/created to inline that logic directly. Old files are deleted. Callers are updated to import from engines. All engine functions throw errors — no `Result<T>` returns.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, Stripe SDK, Graphile Worker, LogTape, `createAppError`/`createNotFoundError`/`createValidationError` from `@/shared/types/errors`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Fill stub | `src/engines/stripe/stripe-api-adapter.ts` | All Stripe invoice API calls — owns createStripeInvoice, finalizeAndSendInvoice, voidInvoice, deleteDraftInvoice, getStripeInvoice |
| Rewrite | `src/engines/financial/refund-engine.ts` | Owns refund execution + persistence — calculatePayoutFeeCreditCents, getRefundCreditFlags, getRefundDestinationAccountId, buildRefundEventPayload, persistExecutedRefund |
| Create | `src/engines/financial/refund-reconciliation.ts` | Owns reconcileRefundExecution — repair stuck refunds, dispatch InvoiceRefunded |
| Update export | `src/engines/financial/index.ts` | Add export for `refundReconciliation` |
| Update caller | `src/modules/invoices/services/invoice-stripe-coordination.service.ts` | Replace `stripeInvoicesService` → `stripeApiAdapter`, remove Result<T> unwrapping |
| Update caller | `src/modules/invoices/services/refund-requests.service.ts` | Replace `refundExecutionPersistenceService.persistExecutedRefund` → `refundEngine.persistExecutedRefund` |
| Update caller | `src/workers/tasks/process-refund-reconciliation.ts` | Replace `refundReconciliationService` → `refundReconciliation` |
| Delete | `src/modules/invoices/services/stripe-invoices.service.ts` | Logic moved to stripeApiAdapter |
| Delete | `src/modules/invoices/services/payment-links.service.ts` | Dead code — no call sites |
| Delete | `src/modules/invoices/services/refund-execution-persistence.service.ts` | Logic moved to refundEngine |
| Delete | `src/modules/invoices/services/refund-reconciliation.service.ts` | Logic moved to refundReconciliation engine |

---

## Task 1: Fill `stripeApiAdapter` with Stripe invoice logic

**Files:**
- Rewrite: `src/engines/stripe/stripe-api-adapter.ts`

Read `src/modules/invoices/services/stripe-invoices.service.ts` before starting — that is the source of truth for all logic to move.

- [ ] **Replace the empty stub** at `src/engines/stripe/stripe-api-adapter.ts` with:

```typescript
import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { stripe } from '@/shared/utils/stripe-client';
import { createAppError } from '@/shared/types/errors';

const logger = getLogger(['engines', 'stripe', 'stripe-api-adapter']);

const wait = (delay: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, delay));

/**
 * Create a Stripe invoice shell with line items attached.
 * Uses separate charges + transfers model (no stripeAccount header).
 * Cleans up on failure.
 */
const createStripeInvoice = async (
  invoice: InvoiceWithRelations,
  stripeCustomerId: string,
  onBehalfOfAccountId: string,
  idempotencyKeyPrefix?: string
): Promise<Stripe.Invoice> => {
  if (!onBehalfOfAccountId) {
    throw createAppError('STRIPE_ACCOUNT_MISSING', 'Missing Stripe account ID for on_behalf_of', 400, { invoiceId: invoice.id });
  }

  const createdItemIds: string[] = [];

  try {
    const stripeInvoice = await stripe.invoices.create(
      {
        customer: stripeCustomerId,
        auto_advance: false,
        collection_method: 'send_invoice',
        on_behalf_of: onBehalfOfAccountId,
        pending_invoice_items_behavior: 'exclude',
        days_until_due: invoice.due_date
          ? Math.max(0, Math.ceil((invoice.due_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : 30,
        metadata: {
          internal_invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
        },
        description: invoice.notes ?? undefined,
        footer: invoice.memo ?? undefined,
      },
      idempotencyKeyPrefix ? { idempotencyKey: `${idempotencyKeyPrefix}:invoice` } : undefined
    );

    if (invoice.lineItems) {
      const createdItems = await Promise.all(
        invoice.lineItems.map((item, index) => {
          const lineItemIdempotencySuffix = item.id ?? `${invoice.id}:${index}`;
          return stripe.invoiceItems.create(
            {
              customer: stripeCustomerId,
              invoice: stripeInvoice.id,
              amount: item.line_total,
              currency: 'usd',
              description: item.description,
              metadata: {
                internal_line_item_id: item.id,
                internal_invoice_id: invoice.id,
              },
            },
            idempotencyKeyPrefix
              ? { idempotencyKey: `${idempotencyKeyPrefix}:line-item:${lineItemIdempotencySuffix}` }
              : undefined
          );
        })
      );
      createdItemIds.push(...createdItems.map((item) => item.id));
    }

    return stripeInvoice;
  } catch (error) {
    await Promise.all(
      createdItemIds.map(async (itemId) => {
        try {
          await stripe.invoiceItems.del(itemId);
        } catch (cleanupError) {
          logger.error('Failed to cleanup Stripe invoice item {itemId}: {error}', {
            itemId,
            error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
          });
        }
      })
    );
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create Stripe invoice {invoiceId}: {error}', { invoiceId: invoice.id, error: message });
    throw createAppError('STRIPE_INVOICE_CREATION_FAILED', `Failed to create Stripe invoice: ${message}`, 500, { invoiceId: invoice.id });
  }
};

/**
 * Finalize a draft Stripe invoice and send it to the customer.
 * Retries send up to 3 times with exponential backoff.
 */
const finalizeAndSendInvoice = async (
  stripeInvoiceId: string,
  idempotencyKeyPrefix?: string
): Promise<Stripe.Invoice> => {
  const sendWithRetry = async (attempt: number): Promise<Stripe.Invoice> => {
    try {
      return await stripe.invoices.sendInvoice(
        stripeInvoiceId,
        {},
        idempotencyKeyPrefix ? { idempotencyKey: `${idempotencyKeyPrefix}:send` } : undefined
      );
    } catch (error) {
      if (attempt >= 3) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to send Stripe invoice {stripeInvoiceId} after 3 attempts: {error}', { stripeInvoiceId, error: message });
        throw createAppError('STRIPE_INVOICE_SEND_FAILED', `Invoice finalized but failed to send: ${message}`, 500, { stripeInvoiceId });
      }
      const delay = 2 ** attempt * 500;
      logger.warn('Failed to send Stripe invoice {stripeInvoiceId}, attempt {attempt}/3. Retrying in {delay}ms...', { stripeInvoiceId, attempt, delay });
      await wait(delay);
      return sendWithRetry(attempt + 1);
    }
  };

  try {
    await stripe.invoices.finalizeInvoice(
      stripeInvoiceId,
      {},
      idempotencyKeyPrefix ? { idempotencyKey: `${idempotencyKeyPrefix}:finalize` } : undefined
    );
    return sendWithRetry(1);
  } catch (error) {
    if (error && typeof error === 'object' && 'kind' in error) throw error;
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to finalize/send Stripe invoice {stripeInvoiceId}: {error}', { stripeInvoiceId, error: message });
    throw createAppError('STRIPE_INVOICE_FINALIZE_FAILED', `Failed to finalize or send Stripe invoice: ${message}`, 500, { stripeInvoiceId });
  }
};

/**
 * Void an open Stripe invoice.
 */
const voidInvoice = async (stripeInvoiceId: string): Promise<Stripe.Invoice> => {
  try {
    return await stripe.invoices.voidInvoice(stripeInvoiceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to void Stripe invoice {stripeInvoiceId}: {error}', { stripeInvoiceId, error: message });
    throw createAppError('STRIPE_INVOICE_VOID_FAILED', `Failed to void Stripe invoice: ${message}`, 500, { stripeInvoiceId });
  }
};

/**
 * Delete a draft Stripe invoice.
 */
const deleteDraftInvoice = async (stripeInvoiceId: string): Promise<Stripe.DeletedInvoice> => {
  try {
    return await stripe.invoices.del(stripeInvoiceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete draft Stripe invoice {stripeInvoiceId}: {error}', { stripeInvoiceId, error: message });
    throw createAppError('STRIPE_INVOICE_DELETE_FAILED', `Failed to delete draft Stripe invoice: ${message}`, 500, { stripeInvoiceId });
  }
};

/**
 * Retrieve a Stripe invoice by ID.
 */
const getStripeInvoice = async (stripeInvoiceId: string): Promise<Stripe.Invoice> => {
  try {
    return await stripe.invoices.retrieve(stripeInvoiceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to retrieve Stripe invoice {stripeInvoiceId}: {error}', { stripeInvoiceId, error: message });
    throw createAppError('STRIPE_INVOICE_FETCH_FAILED', `Failed to retrieve Stripe invoice: ${message}`, 500, { stripeInvoiceId });
  }
};

export const stripeApiAdapter = {
  createStripeInvoice,
  finalizeAndSendInvoice,
  voidInvoice,
  deleteDraftInvoice,
  getStripeInvoice,
};
```

- [ ] **Run typecheck**

```bash
pnpm run typecheck
```

Expected: no new errors related to `stripe-api-adapter.ts`.

- [ ] **Commit**

```bash
git add src/engines/stripe/stripe-api-adapter.ts
git commit -m "feat(engines/stripe): implement stripeApiAdapter with Stripe invoice operations

Moves createStripeInvoice, finalizeAndSendInvoice, voidInvoice,
deleteDraftInvoice, getStripeInvoice from stripe-invoices.service.ts
into the engine layer. All functions now throw on failure instead of
returning Result<T>."
```

---

## Task 2: Rewrite `refundEngine` to own persistence logic

**Files:**
- Rewrite: `src/engines/financial/refund-engine.ts`

Read `src/modules/invoices/services/refund-execution-persistence.service.ts` before starting — that is the source of all logic to inline here. The current `refund-engine.ts` delegates to that service; replace the delegation with the real logic.

- [ ] **Replace the entire file** at `src/engines/financial/refund-engine.ts` with:

```typescript
import { getLogger } from '@logtape/logtape';
import { and, eq } from 'drizzle-orm';
import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { refundRequestsQueries } from '@/modules/invoices/database/queries/refund-requests.queries';
import type { SelectBillingTransaction } from '@/modules/invoices/database/schema/billing-transactions.schema';
import { requirePayoutMeteredFeeCents } from '@/modules/invoices/services/payout-metered-fee.service';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import type { SelectRefundRequest } from '@/modules/invoices/database/schema/refund-requests.schema';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { db } from '@/shared/database';
import type { InvoiceRecord } from '@/modules/invoices/types/refund-request';
import type { RefundEventPayload } from '@/engines/financial/types';
import { createAppError, createNotFoundError } from '@/shared/types/errors';

const logger = getLogger(['engines', 'financial', 'refund-engine']);

const calculatePayoutFeeCreditCents = (
  invoiceId: string,
  amountPaidCents: number,
  refundedAmount: number,
  invoiceTxs: SelectBillingTransaction[],
  refundRequestId?: string
): number => {
  const originalPayoutMeteredFeeCents = requirePayoutMeteredFeeCents(invoiceTxs, invoiceId);
  const priorRefundTxs = invoiceTxs.filter((tx) => {
    if (tx.type !== 'refund') return false;
    const metadata = tx.metadata as Record<string, unknown> | null | undefined;
    if (!refundRequestId) return true;
    const metadataRefundRequestId = typeof metadata?.refund_request_id === 'string' ? metadata.refund_request_id : null;
    return metadataRefundRequestId !== refundRequestId;
  });

  const alreadyCreditedCents = priorRefundTxs.reduce((sum, tx) => {
    if (typeof tx.metered_fee_cents === 'number' && tx.metered_fee_cents > 0) return sum + tx.metered_fee_cents;
    const metadata = tx.metadata as Record<string, unknown> | null | undefined;
    const metadataCredit = metadata?.payout_fee_credit_cents;
    return typeof metadataCredit === 'number' && metadataCredit > 0 ? sum + metadataCredit : sum;
  }, 0);

  const alreadyRefundedAmount = priorRefundTxs.reduce((sum, tx) => sum + tx.amount, 0);
  const cumulativeRefundedAmount = alreadyRefundedAmount + refundedAmount;
  const totalEntitledCredit =
    amountPaidCents > 0
      ? Math.min(originalPayoutMeteredFeeCents, Math.round((originalPayoutMeteredFeeCents * cumulativeRefundedAmount) / amountPaidCents))
      : 0;
  const remainingCredit = Math.max(0, totalEntitledCredit - alreadyCreditedCents);
  return Math.min(Math.max(0, originalPayoutMeteredFeeCents - alreadyCreditedCents), remainingCredit);
};

const getRefundCreditFlags = async (opts: {
  organizationId: string;
  invoiceId: string;
  claimedReqId: string;
  refundedAmount: number;
  amountPaidCents: number;
  tx?: typeof db;
}): Promise<{ creditInvoiceFee: boolean }> => {
  const priorRefunds = await refundRequestsQueries.listByOrganization(opts.organizationId, { invoice_id: opts.invoiceId }, opts.tx);
  const alreadyRefundedCents = priorRefunds
    .filter((r) => r.id !== opts.claimedReqId && r.status === 'executed')
    .reduce((sum, r) => sum + (r.executed_amount ?? 0), 0);
  return { creditInvoiceFee: alreadyRefundedCents + opts.refundedAmount >= opts.amountPaidCents };
};

const getRefundDestinationAccountId = (invoice: InvoiceRecord, invoiceTxs: SelectBillingTransaction[]): string | null => {
  const payoutTx = invoiceTxs.find((tx) => tx.type === 'payout' && tx.destination_account_id);
  if (payoutTx?.destination_account_id) return payoutTx.destination_account_id;
  return invoice.connectedAccount?.stripe_account_id ?? null;
};

const buildRefundEventPayload = async (opts: {
  organizationId: string;
  claimedReq: SelectRefundRequest;
  invoice: InvoiceRecord;
  invoiceTxs: SelectBillingTransaction[];
  refundedAmount: number;
  tx?: typeof db;
}): Promise<RefundEventPayload> => {
  const amountPaidCents = opts.invoice.amount_paid ?? 0;
  const payoutFeeCreditCents = calculatePayoutFeeCreditCents(
    opts.invoice.id,
    amountPaidCents,
    opts.refundedAmount,
    opts.invoiceTxs,
    opts.claimedReq.id
  );
  const { creditInvoiceFee } = await getRefundCreditFlags({
    organizationId: opts.organizationId,
    invoiceId: opts.invoice.id,
    claimedReqId: opts.claimedReq.id,
    refundedAmount: opts.refundedAmount,
    amountPaidCents,
    tx: opts.tx,
  });
  return {
    invoice_id: opts.invoice.id,
    organization_id: opts.organizationId,
    refund_request_id: opts.claimedReq.id,
    refunded_amount: opts.refundedAmount,
    payout_fee_credit_cents: payoutFeeCreditCents,
    credit_invoice_fee: creditInvoiceFee,
  };
};

/**
 * Persist a completed refund: transitions refund request status to 'executed',
 * creates billing transaction, updates retainer balance if applicable,
 * returns the RefundEventPayload needed to dispatch InvoiceRefunded.
 */
const persistExecutedRefund = async (opts: {
  organizationId: string;
  requestId: string;
  executorUserId: string;
  claimedReq: SelectRefundRequest;
  invoice: InvoiceRecord;
  invoiceTxs: SelectBillingTransaction[];
  stripePaymentIntentId: string;
  stripeTransferId: string | null;
  stripeRefundId: string | null;
  refundedAmount: number;
  refundNotes?: string | null;
}): Promise<{ updated: SelectRefundRequest | null; refundEventPayload: RefundEventPayload | null }> => {
  let refundEventPayload: RefundEventPayload | null = null;

  const updated = await db.transaction(async (tx) => {
    await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.id, opts.invoice.id), eq(invoices.organization_id, opts.organizationId)))
      .for('update');

    const lockedInvoice = await invoicesRepository.findInvoiceById(opts.invoice.id, opts.organizationId, tx);
    if (!lockedInvoice) return null;

    const lockedInvoiceTxs = await billingTransactionsRepository.listByInvoiceId(lockedInvoice.id, tx);
    const amountPaidCents = lockedInvoice.amount_paid ?? 0;
    const payoutFeeCreditCents = calculatePayoutFeeCreditCents(
      lockedInvoice.id,
      amountPaidCents,
      opts.refundedAmount,
      lockedInvoiceTxs,
      opts.claimedReq.id
    );
    const { creditInvoiceFee } = await getRefundCreditFlags({
      organizationId: opts.organizationId,
      invoiceId: lockedInvoice.id,
      claimedReqId: opts.claimedReq.id,
      refundedAmount: opts.refundedAmount,
      amountPaidCents,
      tx,
    });

    const executedRequest = await refundRequestsQueries.transitionStatus(
      opts.requestId,
      opts.organizationId,
      'executing',
      {
        status: 'executed',
        stripe_refund_id: opts.stripeRefundId,
        stripe_payment_intent_id: opts.stripePaymentIntentId,
        executed_amount: opts.refundedAmount,
        executed_at: new Date(),
        executed_by_user_id: opts.executorUserId,
        ...(opts.refundNotes ? { review_notes: opts.refundNotes } : {}),
      },
      tx
    );
    if (!executedRequest) return null;

    const refundDestinationAccountId = getRefundDestinationAccountId(lockedInvoice, lockedInvoiceTxs);
    if (refundDestinationAccountId) {
      await billingTransactionsRepository.createTransaction(
        {
          organization_id: opts.organizationId,
          invoice_id: lockedInvoice.id,
          matter_id: lockedInvoice.matter_id,
          amount: opts.refundedAmount,
          metered_fee_cents: payoutFeeCreditCents,
          type: 'refund',
          status: 'completed',
          destination_account_id: refundDestinationAccountId,
          completed_at: new Date(),
          metadata: {
            refund_request_id: opts.claimedReq.id,
            stripe_refund_id: opts.stripeRefundId,
            stripe_payment_intent_id: opts.stripePaymentIntentId,
            stripe_transfer_id: opts.stripeTransferId,
            reverse_transfer: Boolean(opts.stripeTransferId),
            credit_invoice_fee: creditInvoiceFee,
            payout_fee_credit_cents: payoutFeeCreditCents,
          },
        },
        tx
      );
    }

    if (lockedInvoice.invoice_type === 'retainer_deposit' && lockedInvoice.matter_id) {
      const matter = await mattersQueries.findMatterById(lockedInvoice.matter_id, tx);
      if (matter) {
        const newBalance = Math.max(0, matter.retainer_balance - opts.refundedAmount);
        if (matter.retainer_balance < opts.refundedAmount) {
          logger.warn('Retainer refund exceeds current balance for matter {matterId}; clamping to zero', {
            matterId: lockedInvoice.matter_id,
            invoiceId: lockedInvoice.id,
            refundId: opts.stripeRefundId,
            oldBalance: matter.retainer_balance,
            refundedAmount: opts.refundedAmount,
            newBalance,
          });
        }
        logger.info('Decrementing retainer balance for matter {matterId} (refund): {oldBalance} -> {newBalance}', {
          matterId: lockedInvoice.matter_id,
          oldBalance: matter.retainer_balance,
          newBalance,
          refundId: opts.stripeRefundId,
          invoiceId: lockedInvoice.id,
        });
        await mattersQueries.updateRetainerBalance(lockedInvoice.matter_id, newBalance, tx);
      } else {
        logger.warn('Skipping retainer balance update for refund because matter was not found', {
          matterId: lockedInvoice.matter_id,
          invoiceId: lockedInvoice.id,
          refundId: opts.stripeRefundId,
          refundRequestId: opts.requestId,
        });
      }
    }

    refundEventPayload = await buildRefundEventPayload({
      organizationId: opts.organizationId,
      claimedReq: opts.claimedReq,
      invoice: lockedInvoice,
      invoiceTxs: lockedInvoiceTxs,
      refundedAmount: opts.refundedAmount,
      tx,
    });

    return executedRequest;
  });

  return { updated, refundEventPayload };
};

export const refundEngine = {
  persistExecutedRefund,
  buildRefundEventPayload,
  getRefundDestinationAccountId,
  calculatePayoutFeeCreditCents,
};
```

- [ ] **Run typecheck**

```bash
pnpm run typecheck
```

Expected: no errors from `refund-engine.ts`.

- [ ] **Commit**

```bash
git add src/engines/financial/refund-engine.ts
git commit -m "feat(engines/financial): refundEngine owns persistence logic directly

Inlines calculatePayoutFeeCreditCents, getRefundCreditFlags,
getRefundDestinationAccountId, buildRefundEventPayload, persistExecutedRefund
from refund-execution-persistence.service.ts. Removes delegation to old service."
```

---

## Task 3: Create `refund-reconciliation.ts` engine

**Files:**
- Create: `src/engines/financial/refund-reconciliation.ts`
- Modify: `src/engines/financial/index.ts`

Read `src/modules/invoices/services/refund-reconciliation.service.ts` before starting — move the logic here verbatim, converting `createAppError`/`createNotFoundError`/`createValidationError` throws to stay as-is (they already throw).

- [ ] **Create `src/engines/financial/refund-reconciliation.ts`**:

```typescript
import { getLogger } from '@logtape/logtape';
import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { refundRequestsQueries } from '@/modules/invoices/database/queries/refund-requests.queries';
import { refundEngine } from '@/engines/financial/refund-engine';
import type { RefundEventPayload } from '@/engines/financial/types';
import { InvoiceRefunded } from '@/shared/events/definitions';
import { createNotFoundError, createValidationError, createAppError } from '@/shared/types/errors';

const logger = getLogger(['engines', 'financial', 'refund-reconciliation']);

const getStoredRefundEventPayload = (
  claimedReq: Awaited<ReturnType<typeof refundRequestsQueries.findById>>,
  invoiceTxs: Awaited<ReturnType<typeof billingTransactionsRepository.listByInvoiceId>>,
  organizationId: string
): RefundEventPayload | null => {
  if (!claimedReq) return null;

  const matchingRefundTx = invoiceTxs.find((tx) => {
    if (tx.type !== 'refund') return false;
    const metadata = tx.metadata as Record<string, unknown> | null | undefined;
    if (typeof metadata?.refund_request_id === 'string' && metadata.refund_request_id === claimedReq.id) return true;
    return (
      typeof claimedReq.stripe_refund_id === 'string' &&
      typeof metadata?.stripe_refund_id === 'string' &&
      metadata.stripe_refund_id === claimedReq.stripe_refund_id
    );
  });

  if (!matchingRefundTx) return null;

  const metadata = matchingRefundTx.metadata as Record<string, unknown> | null | undefined;
  const payoutFeeCreditCents =
    typeof metadata?.payout_fee_credit_cents === 'number'
      ? metadata.payout_fee_credit_cents
      : matchingRefundTx.metered_fee_cents;
  const creditInvoiceFee = typeof metadata?.credit_invoice_fee === 'boolean' ? metadata.credit_invoice_fee : false;

  return {
    invoice_id: claimedReq.invoice_id,
    organization_id: organizationId,
    refund_request_id: claimedReq.id,
    refunded_amount: claimedReq.executed_amount ?? matchingRefundTx.amount,
    payout_fee_credit_cents: payoutFeeCreditCents,
    credit_invoice_fee: creditInvoiceFee,
  };
};

/**
 * Reconcile a refund that may be stuck in 'executing' or already 'executed'.
 * - If 'executed': rebuild payload from stored data and re-dispatch InvoiceRefunded.
 * - If 'executing': re-run persistence (repair) then dispatch.
 * Throws for unexpected states. Used by the refund reconciliation worker task.
 */
const reconcileRefundExecution = async (opts: {
  organizationId: string;
  requestId: string;
  executorUserId: string;
  stripePaymentIntentId: string;
  stripeTransferId: string | null;
  stripeRefundId: string | null;
  refundedAmount: number;
}): Promise<{ repaired: boolean; dispatched: boolean }> => {
  const claimedReq = await refundRequestsQueries.findById(opts.requestId, opts.organizationId);
  if (!claimedReq) {
    throw createNotFoundError('REFUND_REQUEST_NOT_FOUND', 'Refund request not found for reconciliation', {
      requestId: opts.requestId,
      organizationId: opts.organizationId,
    });
  }

  const invoice = await invoicesRepository.findInvoiceById(claimedReq.invoice_id, opts.organizationId);
  if (!invoice) {
    throw createNotFoundError('INVOICE_NOT_FOUND', 'Invoice not found for reconciliation', {
      invoiceId: claimedReq.invoice_id,
      organizationId: opts.organizationId,
    });
  }

  const invoiceTxs = await billingTransactionsRepository.listByInvoiceId(invoice.id);

  let repaired = false;
  let refundEventPayload: RefundEventPayload | undefined = undefined;

  if (claimedReq.status === 'executed') {
    refundEventPayload =
      getStoredRefundEventPayload(claimedReq, invoiceTxs, opts.organizationId) ??
      (await refundEngine.buildRefundEventPayload({
        organizationId: opts.organizationId,
        claimedReq,
        invoice,
        invoiceTxs,
        refundedAmount: claimedReq.executed_amount ?? opts.refundedAmount,
      }));
  } else if (claimedReq.status === 'executing') {
    const persisted = await refundEngine.persistExecutedRefund({
      organizationId: opts.organizationId,
      requestId: opts.requestId,
      executorUserId: opts.executorUserId,
      claimedReq,
      invoice,
      invoiceTxs,
      stripePaymentIntentId: opts.stripePaymentIntentId,
      stripeTransferId: opts.stripeTransferId,
      stripeRefundId: opts.stripeRefundId,
      refundedAmount: opts.refundedAmount,
      refundNotes: claimedReq.review_notes,
    });

    if (!persisted.updated || !persisted.refundEventPayload) {
      throw createAppError('REFUND_PERSISTENCE_FAILED', 'Refund reconciliation could not persist executed refund', 500, {
        requestId: opts.requestId,
        organizationId: opts.organizationId,
      });
    }

    ({ refundEventPayload } = persisted);
    repaired = true;
  } else {
    throw createValidationError(
      'UNSUPPORTED_REFUND_STATUS',
      `Refund request ${opts.requestId} is in unsupported status ${claimedReq.status} for reconciliation`,
      { requestId: opts.requestId, status: claimedReq.status }
    );
  }

  if (!refundEventPayload) {
    throw createAppError('REFUND_PAYLOAD_BUILD_FAILED', 'Failed to build or retrieve refund event payload', 500, {
      requestId: opts.requestId,
      organizationId: opts.organizationId,
    });
  }

  try {
    await InvoiceRefunded.dispatch(refundEventPayload, {
      actorId: opts.executorUserId,
      actorType: 'user',
      organizationId: opts.organizationId,
      critical: true,
    });
  } catch (error) {
    logger.error('Failed to dispatch InvoiceRefunded during refund reconciliation', {
      actorId: opts.executorUserId,
      organizationId: opts.organizationId,
      refundRequestId: claimedReq.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw createAppError(
      'REFUND_EVENT_DISPATCH_FAILED',
      'Refund reconciliation repaired local state but failed to dispatch refund event',
      500,
      { requestId: opts.requestId, organizationId: opts.organizationId }
    );
  }

  logger.info('Refund reconciliation completed for request {requestId}', {
    requestId: opts.requestId,
    organizationId: opts.organizationId,
    repaired,
    stripeRefundId: opts.stripeRefundId,
  });

  return { repaired, dispatched: true };
};

export const refundReconciliation = {
  reconcileRefundExecution,
};
```

- [ ] **Add export to `src/engines/financial/index.ts`**:

```typescript
export { refundReconciliation } from './refund-reconciliation';
```

Add this line after the existing `export { refundEngine }` line. Keep all other exports unchanged.

- [ ] **Run typecheck**

```bash
pnpm run typecheck
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/engines/financial/refund-reconciliation.ts src/engines/financial/index.ts
git commit -m "feat(engines/financial): create refundReconciliation engine

Moves reconcileRefundExecution from refund-reconciliation.service.ts
into the engine layer. Calls refundEngine.persistExecutedRefund and
refundEngine.buildRefundEventPayload directly — no old service delegation."
```

---

## Task 4: Update callers to use engines

**Files:**
- Modify: `src/modules/invoices/services/invoice-stripe-coordination.service.ts`
- Modify: `src/modules/invoices/services/refund-requests.service.ts`
- Modify: `src/workers/tasks/process-refund-reconciliation.ts`

Read all three files before starting.

### 4A — `invoice-stripe-coordination.service.ts`

- [ ] **Replace the import** of `stripeInvoicesService`:

```typescript
// Remove:
import { stripeInvoicesService } from '@/modules/invoices/services/stripe-invoices.service';

// Add:
import { stripeApiAdapter } from '@/engines/stripe/stripe-api-adapter';
```

- [ ] **Replace `createStripeInvoice` call** in `finalizeAndSendStripeFlow`:

```typescript
// Remove:
const stripeResult = await stripeInvoicesService.createStripeInvoice(
  invWithRel,
  invWithRel.client.stripe_customer_id,
  invWithRel.connectedAccount.stripe_account_id,
  idempotencyKeyPrefix
);
if (!stripeResult.success) {
  throw createAppError(
    'STRIPE_INVOICE_CREATION_FAILED',
    stripeResult.error?.message || 'Failed to create Stripe invoice',
    500,
    { invoiceId, stripeError: stripeResult.error?.code }
  );
}
const stripeInvoice = stripeResult.data;

// Replace with:
const stripeInvoice = await stripeApiAdapter.createStripeInvoice(
  invWithRel,
  invWithRel.client.stripe_customer_id,
  invWithRel.connectedAccount.stripe_account_id,
  idempotencyKeyPrefix
);
```

- [ ] **Replace `finalizeAndSendInvoice` call** in `finalizeAndSendStripeFlow`:

```typescript
// Remove:
const sendResult = await stripeInvoicesService.finalizeAndSendInvoice(stripeInvoice.id, idempotencyKeyPrefix);
if (!sendResult.success) {
  throw createAppError(
    'STRIPE_INVOICE_SEND_FAILED',
    sendResult.error?.message || 'Failed to send Stripe invoice',
    500,
    { invoiceId, stripeInvoiceId: stripeInvoice.id, stripeError: sendResult.error?.code }
  );
}
const finalInvoice = sendResult.data;

// Replace with:
const finalInvoice = await stripeApiAdapter.finalizeAndSendInvoice(stripeInvoice.id, idempotencyKeyPrefix);
```

- [ ] **Replace `getStripeInvoice` call** in `syncInvoice`:

```typescript
// Remove:
const stripeResult = await stripeInvoicesService.getStripeInvoice(invoice.stripe_invoice_id);
if (!stripeResult.success) {
  throw createAppError(
    'STRIPE_FETCH_FAILED',
    stripeResult.error?.message || 'Failed to fetch invoice from Stripe',
    500,
    { invoiceId: id, stripeInvoiceId: invoice.stripe_invoice_id, stripeError: stripeResult.error?.code }
  );
}
// ... uses stripeResult.data

// Replace with:
const stripeInvoice = await stripeApiAdapter.getStripeInvoice(invoice.stripe_invoice_id);
// Update all references from stripeResult.data → stripeInvoice
```

- [ ] **Replace `voidInvoice` call** in `voidInvoice`:

```typescript
// Remove:
const voidResult = await stripeInvoicesService.voidInvoice(invoice.stripe_invoice_id);
if (!voidResult.success) {
  throw createAppError('STRIPE_VOID_FAILED', voidResult.error?.message || 'Failed to void invoice on Stripe', 500, {
    invoiceId: id, stripeInvoiceId: invoice.stripe_invoice_id, stripeError: voidResult.error?.code,
  });
}

// Replace with:
await stripeApiAdapter.voidInvoice(invoice.stripe_invoice_id);
```

### 4B — `refund-requests.service.ts`

- [ ] **Replace the import** of `refundExecutionPersistenceService`:

```typescript
// Remove:
import { refundExecutionPersistenceService } from '@/modules/invoices/services/refund-execution-persistence.service';

// Add:
import { refundEngine } from '@/engines/financial/refund-engine';
```

- [ ] **Replace `persistExecutedRefund` call** in `executeRefund`:

```typescript
// Remove:
const { updated, refundEventPayload } = await refundExecutionPersistenceService.persistExecutedRefund({

// Replace with:
const { updated, refundEventPayload } = await refundEngine.persistExecutedRefund({
```

All arguments remain identical — no other changes needed.

### 4C — `process-refund-reconciliation.ts`

- [ ] **Replace the import** of `refundReconciliationService`:

```typescript
// Remove:
import { refundReconciliationService } from '@/modules/invoices/services/refund-reconciliation.service';

// Add:
import { refundReconciliation } from '@/engines/financial/refund-reconciliation';
```

- [ ] **Replace `reconcileRefundExecution` call**:

```typescript
// Remove:
const res = await refundReconciliationService.reconcileRefundExecution({

// Replace with:
const res = await refundReconciliation.reconcileRefundExecution({
```

All arguments remain identical.

- [ ] **Run typecheck**

```bash
pnpm run typecheck
```

Expected: no errors. Fix any remaining type errors before committing.

- [ ] **Commit**

```bash
git add src/modules/invoices/services/invoice-stripe-coordination.service.ts \
        src/modules/invoices/services/refund-requests.service.ts \
        src/workers/tasks/process-refund-reconciliation.ts
git commit -m "refactor: update callers to import from engines instead of old services

- invoice-stripe-coordination → stripeApiAdapter (removes Result<T> unwrapping)
- refund-requests → refundEngine.persistExecutedRefund
- process-refund-reconciliation → refundReconciliation.reconcileRefundExecution"
```

---

## Task 5: Delete old service files

**Files to delete:**
- `src/modules/invoices/services/stripe-invoices.service.ts`
- `src/modules/invoices/services/payment-links.service.ts`
- `src/modules/invoices/services/refund-execution-persistence.service.ts`
- `src/modules/invoices/services/refund-reconciliation.service.ts`

- [ ] **Delete all four files**:

```bash
rm src/modules/invoices/services/stripe-invoices.service.ts
rm src/modules/invoices/services/payment-links.service.ts
rm src/modules/invoices/services/refund-execution-persistence.service.ts
rm src/modules/invoices/services/refund-reconciliation.service.ts
```

- [ ] **Run typecheck** to verify no remaining imports reference deleted files:

```bash
pnpm run typecheck
```

Expected: no errors. If any file still imports from a deleted service, update it to import from the corresponding engine.

- [ ] **Run format check**:

```bash
pnpm run format:check
```

- [ ] **Commit**

```bash
git add -A
git commit -m "chore: delete old invoice service files replaced by engines

Removes stripe-invoices.service.ts, payment-links.service.ts (dead code),
refund-execution-persistence.service.ts, refund-reconciliation.service.ts.
Logic now lives authoritatively in stripeApiAdapter and financial engines."
```

---

## Summary

| Engine | Before | After |
|--------|--------|-------|
| `stripeApiAdapter` | Empty 14-line stub | Owns all Stripe invoice API calls |
| `refundEngine` | Wrapper delegating to old service | Owns all refund execution + persistence logic |
| `refundReconciliation` | Didn't exist (logic in old service) | Owns reconcileRefundExecution |
| `retainerPaymentFlow` | Correct — no change needed | ✅ |
| `transferExecutor` | Correct — no change needed | ✅ |
| `billingRecorder` | Correct — no change needed | ✅ |

---

## Follow-up

See [2026-04-03-error-handling-standardisation.md](./2026-04-03-error-handling-standardisation.md) for the consistent error handling migration plan.

---

## Future Work: Consistent Error Handling (Separate Plan)

> **Do not implement as part of this plan.** This is a follow-up refactor that touches the entire codebase and must be done uniformly — not piecemeal.

### Goal

Replace the mix of `createAppError`/`createNotFoundError`/`createValidationError` (plain object throws) with `HTTPException` (real Error subclass with stack traces) everywhere, and add proper handling for Stripe and DB exception types.

### Why this matters

- `createAppError` returns plain objects — **stack traces are lost**
- Callers do `'kind' in error` type checks to re-throw — fragile, non-standard
- Stripe and DB throw their own exception types that bypass the current error handling if not caught explicitly
- CLAUDE.md mandates `HTTPException` — current codebase contradicts the standard

### What the follow-up plan should cover

#### 1. Standardise application errors → `HTTPException`

Replace all `createAppError`/`createNotFoundError`/`createValidationError` calls across every service and engine:

| Old pattern | New pattern |
|---|---|
| `throw createNotFoundError('CODE', 'msg')` | `throw new HTTPException(404, { message: 'msg' })` |
| `throw createValidationError('CODE', 'msg')` | `throw new HTTPException(400, { message: 'msg' })` |
| `throw createAppError('CODE', 'msg', 409)` | `throw new HTTPException(409, { message: 'msg' })` |
| `throw createAppError('CODE', 'msg', 500)` | `throw new Error('msg')` |

Remove `if (error && typeof error === 'object' && 'kind' in error) throw error` re-throw guards from all callers — they become unnecessary.

#### 2. Stripe exception normalisation — `wrapStripeError(err)`

Create `src/shared/utils/stripe-error.ts`:

```typescript
import { Stripe } from 'stripe';
import { HTTPException } from 'hono/http-exception';

export const wrapStripeError = (err: unknown): never => {
  if (err instanceof Stripe.errors.StripeCardError) {
    // Card declined — safe to surface to user
    throw new HTTPException(422, { message: err.message });
  }
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    // Bad API call — our bug, don't expose internals
    throw new Error(`Stripe invalid request: ${err.message}`);
  }
  if (
    err instanceof Stripe.errors.StripeConnectionError ||
    err instanceof Stripe.errors.StripeRateLimitError
  ) {
    // Transient — re-throw as Error so Graphile Worker retries
    throw new Error(`Stripe transient error: ${err.message}`);
  }
  if (err instanceof Stripe.errors.StripeAuthenticationError) {
    throw new Error(`Stripe authentication failure — check API key`);
  }
  // All other Stripe errors → 500
  throw new Error(err instanceof Error ? err.message : 'Unknown Stripe error');
};
```

Use in all Stripe catch blocks: `catch (err) { wrapStripeError(err); }`

#### 3. DB exception normalisation — `wrapDbError(err)`

Create `src/shared/utils/db-error.ts`:

```typescript
import { HTTPException } from 'hono/http-exception';

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_SERIALIZATION_FAILURE = '40001';

export const wrapDbError = (err: unknown): never => {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code;
    if (code === PG_UNIQUE_VIOLATION) {
      throw new HTTPException(409, { message: 'Resource already exists' });
    }
    if (code === PG_FOREIGN_KEY_VIOLATION) {
      throw new HTTPException(400, { message: 'Invalid reference — related resource not found' });
    }
    if (code === PG_SERIALIZATION_FAILURE) {
      // Transaction conflict — re-throw so caller/worker retries
      throw new Error('Database serialization failure — retry');
    }
  }
  throw new Error(err instanceof Error ? err.message : 'Unknown database error');
};
```

Use in DB catch blocks where raw pg errors may surface.

#### 4. Scope of changes

- All files under `src/modules/*/services/`
- All files under `src/engines/`
- All files under `src/workers/tasks/`
- Delete `src/shared/types/errors.ts` (or keep only for migration shim, then delete)
- Update Hono global error handler if needed to ensure `HTTPException` is caught and formatted correctly
