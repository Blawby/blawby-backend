import { and, eq } from 'drizzle-orm';
import { getLogger } from '@logtape/logtape';

import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { refundRequestsQueries } from '@/modules/invoices/database/queries/refund-requests.queries';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { db } from '@/shared/database';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';

import type { SelectBillingTransaction } from '@/modules/invoices/database/schema/billing-transactions.schema';
import type { SelectRefundRequest } from '@/modules/invoices/database/schema/refund-requests.schema';

const logger = getLogger(['invoices', 'refund-execution-persistence']);
const PLATFORM_VARIABLE_FEE_RATE = 0.01337;

type InvoiceRecord = NonNullable<Awaited<ReturnType<typeof invoicesRepository.findInvoiceById>>>;

export type RefundEventPayload = {
  invoice_id: string;
  organization_id: string;
  refund_request_id: string;
  refunded_amount: number;
  payout_fee_credit_cents: number;
  credit_invoice_fee: boolean;
};

const getRefundCreditFlags = async (opts: {
  organizationId: string;
  invoiceId: string;
  claimedReqId: string;
  refundedAmount: number;
  amountPaidCents: number;
  tx?: typeof db;
}): Promise<{ creditInvoiceFee: boolean }> => {
  const priorRefunds = await refundRequestsQueries.listByOrganization(
    opts.organizationId,
    { invoice_id: opts.invoiceId },
    opts.tx,
  );
  const alreadyRefundedCents = priorRefunds
    .filter((refundRequest) => refundRequest.id !== opts.claimedReqId && refundRequest.status === 'executed')
    .reduce((sum, refundRequest) => sum + (refundRequest.executed_amount ?? 0), 0);

  return {
    creditInvoiceFee: alreadyRefundedCents + opts.refundedAmount >= opts.amountPaidCents,
  };
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
  const payoutFeeCreditCents = calculatePayoutFeeCreditCents(amountPaidCents, opts.refundedAmount, opts.invoiceTxs);
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

const getPayoutMeteredFeeCents = (invoiceTxs: SelectBillingTransaction[]): number => {
  const payoutTx = invoiceTxs.find((tx) => tx.type === 'payout');
  if (!payoutTx) return 0;

  if (typeof payoutTx.metered_fee_cents === 'number' && payoutTx.metered_fee_cents > 0) {
    return payoutTx.metered_fee_cents;
  }

  const metadataFee = (payoutTx.metadata as Record<string, unknown> | null | undefined)?.metered_fee_cents;
  return typeof metadataFee === 'number' && metadataFee > 0 ? metadataFee : 0;
};

const getRefundDestinationAccountId = (
  invoice: InvoiceRecord,
  invoiceTxs: SelectBillingTransaction[],
): string | null => {
  const payoutTx = invoiceTxs.find((tx) => tx.type === 'payout' && tx.destination_account_id);
  if (payoutTx?.destination_account_id) {
    return payoutTx.destination_account_id;
  }

  return invoice.connectedAccount?.stripe_account_id ?? null;
};

const calculatePayoutFeeCreditCents = (
  amountPaidCents: number,
  refundedAmount: number,
  invoiceTxs: SelectBillingTransaction[],
): number => {
  const originalPayoutMeteredFeeCents = getPayoutMeteredFeeCents(invoiceTxs)
    || Math.round(amountPaidCents * PLATFORM_VARIABLE_FEE_RATE);

  return amountPaidCents > 0
    ? Math.min(
        originalPayoutMeteredFeeCents,
        Math.round((originalPayoutMeteredFeeCents * refundedAmount) / amountPaidCents),
      )
    : 0;
};

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
    await tx.select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.id, opts.invoice.id), eq(invoices.organization_id, opts.organizationId)))
      .for('update');

    const lockedInvoice = await invoicesRepository.findInvoiceById(
      opts.invoice.id,
      opts.organizationId,
      tx,
    );
    if (!lockedInvoice) return null;

    const lockedInvoiceTxs = await billingTransactionsRepository.listByInvoiceId(lockedInvoice.id, tx);
    const amountPaidCents = lockedInvoice.amount_paid ?? 0;
    const payoutFeeCreditCents = calculatePayoutFeeCreditCents(amountPaidCents, opts.refundedAmount, lockedInvoiceTxs);
    const { creditInvoiceFee } = await getRefundCreditFlags({
      organizationId: opts.organizationId,
      invoiceId: lockedInvoice.id,
      claimedReqId: opts.claimedReq.id,
      refundedAmount: opts.refundedAmount,
      amountPaidCents,
      tx,
    });

    const executedRequest = await refundRequestsQueries.transitionStatus(opts.requestId, opts.organizationId, 'executing', {
      status: 'executed',
      stripe_refund_id: opts.stripeRefundId,
      stripe_payment_intent_id: opts.stripePaymentIntentId,
      executed_amount: opts.refundedAmount,
      executed_at: new Date(),
      executed_by_user_id: opts.executorUserId,
      ...(opts.refundNotes ? { review_notes: opts.refundNotes } : {}),
    }, tx);
    if (!executedRequest) return null;

    const refundDestinationAccountId = getRefundDestinationAccountId(lockedInvoice, lockedInvoiceTxs);
    if (refundDestinationAccountId) {
      await billingTransactionsRepository.createTransaction({
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
          stripe_refund_id: opts.stripeRefundId,
          stripe_payment_intent_id: opts.stripePaymentIntentId,
          stripe_transfer_id: opts.stripeTransferId,
          reverse_transfer: !!opts.stripeTransferId,
          credit_invoice_fee: creditInvoiceFee,
          payout_fee_credit_cents: payoutFeeCreditCents,
        },
      }, tx);
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

export const refundExecutionPersistenceService = {
  calculatePayoutFeeCreditCents,
  getPayoutMeteredFeeCents,
  getRefundDestinationAccountId,
  buildRefundEventPayload,
  persistExecutedRefund,
};
