import { eq, and } from 'drizzle-orm';
import { getLogger } from '@logtape/logtape';
import Stripe from 'stripe';

import { stripe } from '@/shared/utils/stripe-client';
import { InvoiceRefunded, SystemErrorOccurred } from '@/shared/events/definitions';

import { refundRequestsQueries } from '@/modules/invoices/database/queries/refund-requests.queries';
import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import { result } from '@/shared/utils/result';
import { db } from '@/shared/database';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';

import type { SelectRefundRequest } from '@/modules/invoices/database/schema/refund-requests.schema';
import type { Result } from '@/shared/types/result';

function isStripeError(err: unknown): err is Stripe.errors.StripeError {
  return err instanceof Stripe.errors.StripeError;
}

const logger = getLogger(['invoices', 'refund-requests']);
const PLATFORM_VARIABLE_FEE_RATE = 0.01337;

const getPayoutMeteredFeeCents = (invoiceTxs: Awaited<ReturnType<typeof billingTransactionsRepository.listByInvoiceId>>): number => {
  const payoutTx = invoiceTxs.find((tx) => tx.type === 'payout');
  if (!payoutTx) return 0;

  if (typeof payoutTx.metered_fee_cents === 'number' && payoutTx.metered_fee_cents > 0) {
    return payoutTx.metered_fee_cents;
  }

  const metadataFee = (payoutTx.metadata as Record<string, unknown> | null | undefined)?.metered_fee_cents;
  return typeof metadataFee === 'number' && metadataFee > 0 ? metadataFee : 0;
};

const getRefundDestinationAccountId = (
  invoice: NonNullable<Awaited<ReturnType<typeof invoicesRepository.findInvoiceById>>>,
  invoiceTxs: Awaited<ReturnType<typeof billingTransactionsRepository.listByInvoiceId>>,
): string | null => {
  const payoutTx = invoiceTxs.find((tx) => tx.type === 'payout' && tx.destination_account_id);
  if (payoutTx?.destination_account_id) {
    return payoutTx.destination_account_id;
  }

  return invoice.connectedAccount?.stripe_account_id ?? null;
};

const createRequest = async (opts: {
  organizationId: string;
  invoiceId: string;
  userId: string;
  requestedAmount: number;
  reason: string;
  notes?: string;
}): Promise<Result<SelectRefundRequest>> => {
  try {
    const clientResult = await invoiceClientResolver.resolveUserDetailId(opts.organizationId, opts.userId);
    if (!clientResult.success) return clientResult;
    const clientUserDetailsId = clientResult.data;

    return await db.transaction(async (tx) => {
      await tx.select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.id, opts.invoiceId), eq(invoices.organization_id, opts.organizationId)))
        .for('update');

      const invoice = await invoicesRepository.findOneByIdAndClientId(
        opts.organizationId,
        opts.invoiceId,
        clientUserDetailsId,
        tx,
      );
      if (!invoice) return result.notFound('Invoice not found');
      if (invoice.status !== 'paid') {
        return result.badRequest('Refunds can only be requested for paid invoices');
      }

      if (typeof opts.requestedAmount !== 'number' || !Number.isInteger(opts.requestedAmount) || opts.requestedAmount <= 0) {
        return result.badRequest('Requested amount must be a positive integer amount in cents');
      }

      const existingRefunds = await refundRequestsQueries.listByOrganization(
        opts.organizationId,
        { invoice_id: opts.invoiceId },
        tx,
      );

      const blockingStatuses: ReadonlyArray<SelectRefundRequest['status']> = ['requested', 'approved', 'executing'];
      if (existingRefunds.some((r) => blockingStatuses.includes(r.status))) {
        return result.badRequest('An open refund request already exists for this invoice');
      }

      const reservedStatuses: ReadonlyArray<SelectRefundRequest['status']> = ['requested', 'approved', 'executing', 'executed'];
      const reservedAmount = existingRefunds
        .filter((refundRequest) => reservedStatuses.includes(refundRequest.status))
        .reduce((sum, refundRequest) => sum + (refundRequest.executed_amount ?? refundRequest.requested_amount), 0);
      const remainingRefundable = Math.max(0, (invoice.amount_paid ?? 0) - reservedAmount);

      if (opts.requestedAmount > remainingRefundable) {
        return result.badRequest(`Requested refund amount exceeds remaining refundable amount (${remainingRefundable} cents)`);
      }

      const req = await refundRequestsQueries.create({
        organization_id: opts.organizationId,
        invoice_id: opts.invoiceId,
        client_user_details_id: clientUserDetailsId,
        created_by_user_details_id: clientUserDetailsId,
        requested_amount: opts.requestedAmount,
        reason: opts.reason,
        notes: opts.notes,
        status: 'requested',
      }, tx);

      return result.ok(req);
    });
  } catch (error) {
    logger.error('Failed to create refund request: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return result.internalError('Failed to create refund request');
  }
};

const listClientRequests = async (
  organizationId: string,
  userId: string,
): Promise<Result<SelectRefundRequest[]>> => {
  try {
    const clientResult = await invoiceClientResolver.resolveUserDetailId(organizationId, userId);
    if (!clientResult.success) return clientResult;
    return result.ok(await refundRequestsQueries.listByClient(organizationId, clientResult.data));
  } catch (error) {
    logger.error('Failed to list refund requests', { error });
    return result.internalError('Failed to list refund requests');
  }
};

const cancelRequest = async (opts: {
  organizationId: string;
  requestId: string;
  userId: string;
}): Promise<Result<SelectRefundRequest>> => {
  try {
    const clientResult = await invoiceClientResolver.resolveUserDetailId(opts.organizationId, opts.userId);
    if (!clientResult.success) return clientResult;

    const updated = await refundRequestsQueries.transitionStatusForClient(
      opts.requestId,
      opts.organizationId,
      clientResult.data,
      'requested',
      { status: 'cancelled' },
    );
    if (!updated) {
      return result.badRequest('Only pending refund requests can be cancelled, or request not found');
    }
    return result.ok(updated);
  } catch (error) {
    logger.error('Failed to cancel refund request', { error });
    return result.internalError('Failed to cancel refund request');
  }
};

const listPracticeRequests = async (
  organizationId: string,
  filters?: { status?: string; invoice_id?: string; client_user_details_id?: string },
): Promise<Result<SelectRefundRequest[]>> => {
  try {
    return result.ok(await refundRequestsQueries.listByOrganization(organizationId, filters));
  } catch (error) {
    logger.error('Failed to list refund requests', { error });
    return result.internalError('Failed to list refund requests');
  }
};

const reviewRequest = async (opts: {
  organizationId: string;
  requestId: string;
  reviewerUserId: string;
  action: 'approved' | 'rejected';
  reviewNotes?: string;
}): Promise<Result<SelectRefundRequest>> => {
  try {
    const updated = await refundRequestsQueries.transitionStatus(
      opts.requestId,
      opts.organizationId,
      'requested',
      {
        status: opts.action,
        reviewed_by_user_id: opts.reviewerUserId,
        reviewed_at: new Date(),
        review_notes: opts.reviewNotes,
      },
    );
    if (!updated) {
      return result.badRequest('Only pending refund requests can be reviewed, or request not found');
    }
    return result.ok(updated);
  } catch (error) {
    logger.error('Failed to review refund request', { error });
    return result.internalError('Failed to review refund request');
  }
};

const executeRefund = async (opts: {
  organizationId: string;
  requestId: string;
  executorUserId: string;
}): Promise<Result<SelectRefundRequest>> => {
  try {
    const claimedReq = await refundRequestsQueries.transitionStatus(opts.requestId, opts.organizationId, 'approved', {
      status: 'executing',
      executed_by_user_id: opts.executorUserId,
    });

    if (!claimedReq) {
      const existing = await refundRequestsQueries.findById(opts.requestId, opts.organizationId);
      if (!existing) return result.notFound('Refund request not found');
      return result.badRequest('Only approved refund requests can be executed, or request is currently being executed');
    }

    const invoice = await invoicesRepository.findInvoiceById(claimedReq.invoice_id, opts.organizationId);
    if (!invoice) {
      try {
        await refundRequestsQueries.transitionStatus(opts.requestId, opts.organizationId, 'executing', { status: 'approved' });
      } catch (rollbackError) {
        logger.error('Failed to rollback refund request after invoice lookup failure', {
          requestId: opts.requestId,
          error: rollbackError instanceof Error ? rollbackError.message : 'Unknown error',
        });
      }
      return result.notFound('Invoice not found');
    }

    const stripePaymentIntentId = invoice.stripe_payment_intent_id;
    if (!stripePaymentIntentId) {
      try {
        await refundRequestsQueries.transitionStatus(opts.requestId, opts.organizationId, 'executing', { status: 'approved' });
      } catch (rollbackError) {
        logger.error('Failed to rollback refund request after missing payment intent', {
          requestId: opts.requestId,
          error: rollbackError instanceof Error ? rollbackError.message : 'Unknown error',
        });
      }
      return result.badRequest('Invoice has no Stripe payment intent ID — cannot refund');
    }

    try {
      const invoiceTxs = await billingTransactionsRepository.listByInvoiceId(invoice.id);
      let stripeTransferId = invoice.stripe_transfer_id;
      if (!stripeTransferId) {
        stripeTransferId = invoiceTxs.find((tx) => tx.type === 'payout' && !!tx.stripe_transfer_id)?.stripe_transfer_id ?? null;
      }

      const refund = await stripe.refunds.create({
        payment_intent: stripePaymentIntentId,
        amount: claimedReq.requested_amount,
        metadata: {
          refund_request_id: claimedReq.id,
          invoice_id: claimedReq.invoice_id,
          organization_id: opts.organizationId,
          ...(stripeTransferId ? { stripe_transfer_id: stripeTransferId } : {}),
        },
        ...(stripeTransferId ? { reverse_transfer: true } : {}),
      }, {
        idempotencyKey: `refund_request_${opts.requestId}`,
      });

      const amountPaidCents = invoice.amount_paid ?? 0;
      const originalPayoutMeteredFeeCents = getPayoutMeteredFeeCents(invoiceTxs)
        || Math.round(amountPaidCents * PLATFORM_VARIABLE_FEE_RATE);
      const payoutFeeCreditCents = amountPaidCents > 0
        ? Math.min(
            originalPayoutMeteredFeeCents,
            Math.round((originalPayoutMeteredFeeCents * refund.amount) / amountPaidCents),
          )
        : 0;

      let refundEventPayload: {
        invoice_id: string;
        organization_id: string;
        refund_request_id: string;
        refunded_amount: number;
        payout_fee_credit_cents: number;
        credit_invoice_fee: boolean;
      } | null = null;

      const updated = await db.transaction(async (tx) => {
        await tx.select({ id: invoices.id })
          .from(invoices)
          .where(and(eq(invoices.id, invoice.id), eq(invoices.organization_id, opts.organizationId)))
          .for('update');

        const priorRefunds = await refundRequestsQueries.listByOrganization(
          opts.organizationId,
          { invoice_id: invoice.id },
          tx,
        );
        const alreadyRefundedCents = priorRefunds
          .filter((refundRequest) => refundRequest.id !== claimedReq.id && refundRequest.status === 'executed')
          .reduce((sum, refundRequest) => sum + (refundRequest.executed_amount ?? 0), 0);
        const creditInvoiceFee = alreadyRefundedCents + refund.amount >= amountPaidCents;

        const executedRequest = await refundRequestsQueries.transitionStatus(opts.requestId, opts.organizationId, 'executing', {
          status: 'executed',
          stripe_refund_id: refund.id,
          stripe_payment_intent_id: stripePaymentIntentId,
          executed_amount: refund.amount,
          executed_at: new Date(),
          executed_by_user_id: opts.executorUserId,
        }, tx);
        if (!executedRequest) return null;

        const refundDestinationAccountId = getRefundDestinationAccountId(invoice, invoiceTxs);
        if (refundDestinationAccountId) {
          await billingTransactionsRepository.createTransaction({
            organization_id: opts.organizationId,
            invoice_id: invoice.id,
            matter_id: invoice.matter_id,
            amount: refund.amount,
            metered_fee_cents: payoutFeeCreditCents,
            type: 'refund',
            status: 'completed',
            destination_account_id: refundDestinationAccountId,
            completed_at: new Date(),
            metadata: {
              stripe_refund_id: refund.id,
              stripe_payment_intent_id: stripePaymentIntentId,
              stripe_transfer_id: stripeTransferId,
              reverse_transfer: !!stripeTransferId,
              credit_invoice_fee: creditInvoiceFee,
              payout_fee_credit_cents: payoutFeeCreditCents,
            },
          }, tx);
        }

        refundEventPayload = {
          invoice_id: invoice.id,
          organization_id: opts.organizationId,
          refund_request_id: claimedReq.id,
          refunded_amount: refund.amount,
          payout_fee_credit_cents: payoutFeeCreditCents,
          credit_invoice_fee: creditInvoiceFee,
        };

        return executedRequest;
      });

      if (!updated) {
        logger.error('Stripe refund succeeded but local refund DB update failed', {
          refundId: refund.id,
          requestId: opts.requestId,
          invoiceId: invoice.id,
          organizationId: opts.organizationId,
          paymentIntentId: stripePaymentIntentId,
          stripeTransferId,
          executorUserId: opts.executorUserId,
          requestedAmount: claimedReq.requested_amount,
          refundedAmount: refund.amount,
        });
        await SystemErrorOccurred.dispatch({
          error: 'Stripe refund succeeded but local refund DB update failed',
          context: {
            refundId: refund.id,
            requestId: opts.requestId,
            invoiceId: invoice.id,
            organizationId: opts.organizationId,
            paymentIntentId: stripePaymentIntentId,
            stripeTransferId,
            executorUserId: opts.executorUserId,
            requestedAmount: claimedReq.requested_amount,
            refundedAmount: refund.amount,
          },
        }, {
          actorId: opts.executorUserId,
          actorType: 'user',
          organizationId: opts.organizationId,
        });
        return result.internalError(`Stripe refund ${refund.id} completed, but local DB update failed`);
      }

      if (refundEventPayload) {
        try {
          await InvoiceRefunded.dispatch(refundEventPayload, {
            actorId: opts.executorUserId,
            actorType: 'user',
            organizationId: opts.organizationId,
          });
        } catch (dispatchError) {
          logger.error('Refund executed but failed to dispatch InvoiceRefunded for request {requestId}', {
            requestId: opts.requestId,
            invoiceId: invoice.id,
            error: dispatchError instanceof Error ? dispatchError.message : 'Unknown error',
          });
        }
      }

      return result.ok(updated);
    } catch (stripeError) {
      const errorMsg = stripeError instanceof Error ? stripeError.message : 'Unknown error';
      const isTransient = (isStripeError(stripeError) && (
        stripeError.type === 'StripeConnectionError'
        || stripeError.type === 'StripeRateLimitError'
        || stripeError.code === 'ECONNRESET'
        || stripeError.code === 'ETIMEDOUT'
      )) || (stripeError instanceof Error && (
        (stripeError as { code?: string }).code === 'ECONNRESET'
        || (stripeError as { code?: string }).code === 'ETIMEDOUT'
      ));

      if (isTransient) {
        try {
          await refundRequestsQueries.transitionStatus(
            opts.requestId,
            opts.organizationId,
            'executing',
            { status: 'approved' },
          );
        } catch (rollbackError) {
          logger.error('Failed to rollback transient refund request back to approved', {
            requestId: opts.requestId,
            organizationId: opts.organizationId,
            error: rollbackError instanceof Error ? rollbackError.message : 'Unknown error',
          });
        }
        return result.internalError('Stripe refund transient error — please retry later');
      }

      await refundRequestsQueries.transitionStatus(opts.requestId, opts.organizationId, 'executing', {
        status: 'failed',
        executed_by_user_id: opts.executorUserId,
        executed_at: new Date(),
        review_notes: claimedReq.review_notes ? `${claimedReq.review_notes}\n\nStripe error: ${errorMsg}` : `Stripe error: ${errorMsg}`,
      });

      return result.internalError('Stripe refund failed — request marked as failed');
    }
  } catch (error) {
    logger.error('Failed to execute refund', { error });
    return result.internalError('Failed to execute refund');
  }
};

export const refundRequestsService = {
  createRequest,
  listClientRequests,
  cancelRequest,
  listPracticeRequests,
  reviewRequest,
  executeRefund,
};
