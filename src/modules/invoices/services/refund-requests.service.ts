import { eq, and } from 'drizzle-orm';
import { getLogger } from '@logtape/logtape';
import Stripe from 'stripe';

import { stripe } from '@/shared/utils/stripe-client';
import { InvoiceRefunded, SystemErrorOccurred } from '@/shared/events/definitions';

import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { refundRequestsQueries } from '@/modules/invoices/database/queries/refund-requests.queries';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { refundExecutionPersistenceService } from '@/modules/invoices/services/refund-execution-persistence.service';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import { addRefundReconciliationJob } from '@/shared/queue/queue.manager';
import { result } from '@/shared/utils/result';
import { db } from '@/shared/database';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';

import type { SelectRefundRequest } from '@/modules/invoices/database/schema/refund-requests.schema';
import type { Result } from '@/shared/types/result';

function isStripeError(err: unknown): err is Stripe.errors.StripeError {
  return err instanceof Stripe.errors.StripeError;
}

const logger = getLogger(['invoices', 'refund-requests']);

type RefundOutcome = {
  refundedAmount: number;
  stripeRefundId: string | null;
  notes?: string;
};

export const maybeCancelCancelablePaymentIntent = async (opts: {
  stripePaymentIntentId: string;
  requestedAmount: number;
  amountPaidCents: number;
  paidAt: Date | null;
}, deps: {
  retrieve: typeof stripe.paymentIntents.retrieve;
  cancel: typeof stripe.paymentIntents.cancel;
} = {
  retrieve: stripe.paymentIntents.retrieve.bind(stripe.paymentIntents),
  cancel: stripe.paymentIntents.cancel.bind(stripe.paymentIntents),
}): Promise<RefundOutcome | null> => {
  const isFullRefund = opts.requestedAmount === opts.amountPaidCents;
  const isSameDay = opts.paidAt
    ? (Date.now() - opts.paidAt.getTime()) <= 24 * 60 * 60 * 1000
    : false;

  if (!isFullRefund || !isSameDay) return null;

  try {
    const paymentIntent = await deps.retrieve(opts.stripePaymentIntentId);
    if (paymentIntent.status !== 'requires_capture') {
      return null;
    }

    await deps.cancel(opts.stripePaymentIntentId);
    return {
      refundedAmount: opts.requestedAmount,
      stripeRefundId: null,
      notes: 'PaymentIntent canceled before capture; no Stripe refund object created',
    };
  } catch (error) {
    logger.warn('Same-day payment intent cancel path unavailable for {paymentIntentId}: {error}', {
      paymentIntentId: opts.stripePaymentIntentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
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

      const refundableBalanceCheck = await db.transaction(async (tx) => {
        await tx.select({ id: invoices.id })
          .from(invoices)
          .where(and(eq(invoices.id, invoice.id), eq(invoices.organization_id, opts.organizationId)))
          .for('update');

        const priorRefunds = await refundRequestsQueries.listByOrganization(
          opts.organizationId,
          { invoice_id: invoice.id },
          tx,
        );
        const reservedStatuses: ReadonlyArray<SelectRefundRequest['status']> = ['requested', 'approved', 'executing', 'executed'];
        const reservedAmount = priorRefunds
          .filter((refundRequest) => refundRequest.id !== claimedReq.id && reservedStatuses.includes(refundRequest.status))
          .reduce((sum, refundRequest) => sum + (refundRequest.executed_amount ?? refundRequest.requested_amount), 0);

        return Math.max(0, (invoice.amount_paid ?? 0) - reservedAmount);
      });

      if (claimedReq.requested_amount > refundableBalanceCheck) {
        try {
          await refundRequestsQueries.transitionStatus(
            opts.requestId,
            opts.organizationId,
            'executing',
            { status: 'approved' },
          );
        } catch (rollbackError) {
          logger.error('Failed to rollback over-limit refund request back to approved', {
            requestId: opts.requestId,
            organizationId: opts.organizationId,
            error: rollbackError instanceof Error ? rollbackError.message : 'Unknown error',
          });
        }
        return result.badRequest(`Requested refund amount exceeds remaining refundable amount (${refundableBalanceCheck} cents)`);
      }

      const amountPaidCents = invoice.amount_paid ?? 0;
      const canceledPaymentIntent = await maybeCancelCancelablePaymentIntent({
        stripePaymentIntentId,
        requestedAmount: claimedReq.requested_amount,
        amountPaidCents,
        paidAt: invoice.paid_at,
      });

      const refund: RefundOutcome = canceledPaymentIntent ?? await stripe.refunds.create({
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
      }).then((stripeRefund) => ({
        refundedAmount: stripeRefund.amount,
        stripeRefundId: stripeRefund.id,
        notes: undefined,
      }));

      const { updated, refundEventPayload } = await refundExecutionPersistenceService.persistExecutedRefund({
        organizationId: opts.organizationId,
        requestId: opts.requestId,
        executorUserId: opts.executorUserId,
        claimedReq,
        invoice,
        invoiceTxs,
        stripePaymentIntentId,
        stripeTransferId,
        stripeRefundId: refund.stripeRefundId,
        refundedAmount: refund.refundedAmount,
        refundNotes: refund.notes,
      });

      if (!updated) {
        logger.error('Stripe refund succeeded but local refund DB update failed', {
          refundId: refund.stripeRefundId,
          requestId: opts.requestId,
          invoiceId: invoice.id,
          organizationId: opts.organizationId,
          paymentIntentId: stripePaymentIntentId,
          stripeTransferId,
          executorUserId: opts.executorUserId,
          requestedAmount: claimedReq.requested_amount,
          refundedAmount: refund.refundedAmount,
        });
        try {
          await addRefundReconciliationJob({
            organizationId: opts.organizationId,
            requestId: opts.requestId,
            executorUserId: opts.executorUserId,
            stripePaymentIntentId,
            stripeTransferId,
            stripeRefundId: refund.stripeRefundId,
            refundedAmount: refund.refundedAmount,
          });
        } catch (queueError) {
          logger.error('Failed to queue refund reconciliation job after refund DB update failure', {
            requestId: opts.requestId,
            refundId: refund.stripeRefundId,
            error: queueError instanceof Error ? queueError.message : 'Unknown error',
          });
        }
        try {
          await SystemErrorOccurred.dispatch({
            error: 'Stripe refund succeeded but local refund DB update failed',
            context: {
              refundId: refund.stripeRefundId,
              requestId: opts.requestId,
              invoiceId: invoice.id,
              organizationId: opts.organizationId,
              paymentIntentId: stripePaymentIntentId,
              stripeTransferId,
              executorUserId: opts.executorUserId,
              requestedAmount: claimedReq.requested_amount,
              refundedAmount: refund.refundedAmount,
            },
          }, {
            actorId: opts.executorUserId,
            actorType: 'user',
            organizationId: opts.organizationId,
          });
        } catch (dispatchError) {
          logger.error('Failed to dispatch SystemErrorOccurred after refund DB update failure', {
            refundId: refund.stripeRefundId,
            stripeTransferId,
            requestId: opts.requestId,
            error: dispatchError instanceof Error ? dispatchError.message : 'Unknown error',
          });
        }
        return result.internalError(`Stripe refund ${refund.stripeRefundId ?? 'canceled_payment_intent'} completed, but local DB update failed`);
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
