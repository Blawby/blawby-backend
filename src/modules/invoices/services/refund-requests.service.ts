import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { eq, and } from 'drizzle-orm';
import Stripe from 'stripe';


import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { refundRequestsQueries } from '@/modules/invoices/database/queries/refund-requests.queries';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';

import type { SelectRefundRequest } from '@/modules/invoices/database/schema/refund-requests.schema';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import { refundExecutionPersistenceService } from '@/modules/invoices/services/refund-execution-persistence.service';
import type { Action, Subject } from '@/shared/auth/abilities';
import { db } from '@/shared/database';
import { InvoiceRefunded, SystemErrorOccurred } from '@/shared/events/definitions';
import { addRefundReconciliationJob } from '@/shared/queue/queue.manager';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

function isStripeError(err: unknown): err is Stripe.errors.StripeError {
  return err instanceof Stripe.errors.StripeError;
}

const logger = getLogger(['invoices', 'refund-requests']);

type RefundOutcome = {
  refundedAmount: number;
  stripeRefundId: string | null;
  notes?: string;
};

const getForbiddenResult = (ctx: ServiceContext, action: Action, subject: Subject): Result<never> | undefined => {
  try {
    ForbiddenError.from(ctx.ability).throwUnlessCan(action, subject);
    return undefined;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return result.forbidden(error.message);
    }
    throw error;
  }
};

const rollbackExecutingRefundToApproved = async (opts: {
  requestId: string;
  organizationId: string;
  rollbackTrigger: string;
  logContext?: Record<string, unknown>;
}): Promise<void> => {
  try {
    await refundRequestsQueries.transitionStatus(
      opts.requestId,
      opts.organizationId,
      'executing',
      { status: 'approved' },
    );
  } catch (rollbackError) {
    logger.error('Rollback to approved failed; request remains stuck in executing status', {
      requestId: opts.requestId,
      organizationId: opts.organizationId,
      rollbackTrigger: opts.rollbackTrigger,
      error: rollbackError instanceof Error ? rollbackError.message : 'Unknown error',
      ...opts.logContext,
    });
  }
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
  invoiceId: string;
  requestedAmount: number;
  reason: string;
  notes?: string;
}, ctx: ServiceContext): Promise<Result<SelectRefundRequest>> => {
  try {
    const forbiddenResult = getForbiddenResult(ctx, 'create', 'RefundRequest');
    if (forbiddenResult) {
      return forbiddenResult;
    }

    const clientResult = await invoiceClientResolver.resolveUserDetailId(ctx.organizationId, ctx.userId);
    if (!clientResult.success) return clientResult;
    const clientUserDetailsId = clientResult.data;

    return await db.transaction(async (tx) => {
      await tx.select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.id, opts.invoiceId), eq(invoices.organization_id, ctx.organizationId)))
        .for('update');

      const invoice = await invoicesRepository.findOneByIdAndClientId(
        ctx.organizationId,
        opts.invoiceId,
        clientUserDetailsId,
        tx,
      );
      if (!invoice) return result.notFound('Invoice not found');
      if (invoice.status !== 'paid') {
        return result.badRequest('Refunds can only be requested for paid invoices');
      }

      const existingRefunds = await refundRequestsQueries.listByOrganization(
        ctx.organizationId,
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
        organization_id: ctx.organizationId,
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

const listClientRequests = async (ctx: ServiceContext): Promise<Result<SelectRefundRequest[]>> => {
  try {
    const forbiddenResult = getForbiddenResult(ctx, 'read', 'RefundRequest');
    if (forbiddenResult) {
      return forbiddenResult;
    }

    const clientResult = await invoiceClientResolver.resolveUserDetailId(ctx.organizationId, ctx.userId);
    if (!clientResult.success) return clientResult;
    return result.ok(await refundRequestsQueries.listByClient(ctx.organizationId, clientResult.data));
  } catch (error) {
    logger.error('Failed to list refund requests', { error });
    return result.internalError('Failed to list refund requests');
  }
};

const cancelRequest = async (opts: {
  requestId: string;
}, ctx: ServiceContext): Promise<Result<SelectRefundRequest>> => {
  try {
    const forbiddenResult = getForbiddenResult(ctx, 'update', 'RefundRequest');
    if (forbiddenResult) {
      return forbiddenResult;
    }

    const clientResult = await invoiceClientResolver.resolveUserDetailId(ctx.organizationId, ctx.userId);
    if (!clientResult.success) return clientResult;

    const updated = await refundRequestsQueries.transitionStatusForClient(
      opts.requestId,
      ctx.organizationId,
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
  ctx: ServiceContext,
  filters?: { status?: string; invoice_id?: string; client_user_details_id?: string },
): Promise<Result<SelectRefundRequest[]>> => {
  try {
    const forbiddenResult = getForbiddenResult(ctx, 'read', 'RefundRequest');
    if (forbiddenResult) {
      return forbiddenResult;
    }

    return result.ok(await refundRequestsQueries.listByOrganization(ctx.organizationId, filters));
  } catch (error) {
    logger.error('Failed to list refund requests', { error });
    return result.internalError('Failed to list refund requests');
  }
};

const reviewRequest = async (opts: {
  requestId: string;
  action: 'approved' | 'rejected';
  reviewNotes?: string;
}, ctx: ServiceContext): Promise<Result<SelectRefundRequest>> => {
  try {
    const forbiddenResult = getForbiddenResult(ctx, 'update', 'RefundRequest');
    if (forbiddenResult) {
      return forbiddenResult;
    }

    const updated = await refundRequestsQueries.transitionStatus(
      opts.requestId,
      ctx.organizationId,
      'requested',
      {
        status: opts.action,
        reviewed_by_user_id: ctx.userId,
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

const PAYMENT_INTENT_CANCELED_REFUND_ID_PREFIX = 'payment_intent_cancelled';

const executeRefund = async (opts: {
  requestId: string;
}, ctx: ServiceContext): Promise<Result<SelectRefundRequest>> => {
  try {
    const forbiddenResult = getForbiddenResult(ctx, 'update', 'RefundRequest');
    if (forbiddenResult) {
      return forbiddenResult;
    }

    const claimedReq = await refundRequestsQueries.transitionStatus(opts.requestId, ctx.organizationId, 'approved', {
      status: 'executing',
    });

    if (!claimedReq) {
      const existing = await refundRequestsQueries.findById(opts.requestId, ctx.organizationId);
      if (!existing) return result.notFound('Refund request not found');
      return result.badRequest('Only approved refund requests can be executed, or request is currently being executed');
    }

    const invoice = await invoicesRepository.findInvoiceById(claimedReq.invoice_id, ctx.organizationId);
    if (!invoice) {
      await rollbackExecutingRefundToApproved({
        requestId: opts.requestId,
        organizationId: ctx.organizationId,
        rollbackTrigger: 'invoice lookup failed after claim',
      });
      return result.notFound('Invoice not found');
    }

    const stripePaymentIntentId = invoice.stripe_payment_intent_id;
    if (!stripePaymentIntentId) {
      await rollbackExecutingRefundToApproved({
        requestId: opts.requestId,
        organizationId: ctx.organizationId,
        rollbackTrigger: 'missing Stripe payment intent on invoice',
      });
      return result.badRequest('Invoice has no Stripe payment intent ID — cannot refund');
    }

    let invoiceTxs;
    let stripeTransferId = invoice.stripe_transfer_id;
    let refundableBalanceCheck: number;

    try {
      invoiceTxs = await billingTransactionsRepository.listByInvoiceId(invoice.id);
      if (!stripeTransferId) {
        stripeTransferId = invoiceTxs.find((tx) => tx.type === 'payout' && !!tx.stripe_transfer_id)?.stripe_transfer_id ?? null;
      }

      refundableBalanceCheck = await db.transaction(async (tx) => {
        await tx.select({ id: invoices.id })
          .from(invoices)
          .where(and(eq(invoices.id, invoice.id), eq(invoices.organization_id, ctx.organizationId)))
          .for('update');

        const priorRefunds = await refundRequestsQueries.listByOrganization(
          ctx.organizationId,
          { invoice_id: invoice.id },
          tx,
        );
        const reservedStatuses: ReadonlyArray<SelectRefundRequest['status']> = ['requested', 'approved', 'executing', 'executed'];
        const reservedAmount = priorRefunds
          .filter(
            (refundRequest) => refundRequest.id !== claimedReq.id && reservedStatuses.includes(refundRequest.status),
          )
          .reduce((sum, refundRequest) => sum + (refundRequest.executed_amount ?? refundRequest.requested_amount), 0);

        return Math.max(0, (invoice.amount_paid ?? 0) - reservedAmount);
      });
    } catch (error) {
      logger.error('Failed to prepare refund execution before Stripe call', {
        requestId: opts.requestId,
        organizationId: ctx.organizationId,
        invoiceId: invoice.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      await rollbackExecutingRefundToApproved({
        requestId: opts.requestId,
        organizationId: ctx.organizationId,
        rollbackTrigger: 'pre-Stripe preparation error',
        logContext: { invoiceId: invoice.id },
      });
      return result.internalError('Failed to prepare refund execution');
    }

    if (claimedReq.requested_amount > refundableBalanceCheck) {
      await rollbackExecutingRefundToApproved({
        requestId: opts.requestId,
        organizationId: ctx.organizationId,
        rollbackTrigger: 'requested refund exceeded remaining refundable balance',
      });
      return result.badRequest(`Requested refund amount exceeds remaining refundable amount (${refundableBalanceCheck} cents)`);
    }

    let refund: RefundOutcome;
    try {
      const amountPaidCents = invoice.amount_paid ?? 0;
      const canceledPaymentIntent = await maybeCancelCancelablePaymentIntent({
        stripePaymentIntentId,
        requestedAmount: claimedReq.requested_amount,
        amountPaidCents,
        paidAt: invoice.paid_at,
      });

      refund = canceledPaymentIntent ?? await stripe.refunds.create({
        payment_intent: stripePaymentIntentId,
        amount: claimedReq.requested_amount,
        metadata: {
          refund_request_id: claimedReq.id,
          invoice_id: claimedReq.invoice_id,
          organization_id: ctx.organizationId,
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
      if (canceledPaymentIntent) {
        refund = {
          ...canceledPaymentIntent,
          stripeRefundId: `${PAYMENT_INTENT_CANCELED_REFUND_ID_PREFIX}:${stripePaymentIntentId}`,
        };
      }
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
        await rollbackExecutingRefundToApproved({
          requestId: opts.requestId,
          organizationId: ctx.organizationId,
          rollbackTrigger: 'transient Stripe refund error',
        });
        return result.internalError('Stripe refund transient error — please retry later');
      }

      await refundRequestsQueries.transitionStatus(opts.requestId, ctx.organizationId, 'executing', {
        status: 'failed',
        executed_by_user_id: ctx.userId,
        executed_at: new Date(),
        review_notes: claimedReq.review_notes ? `${claimedReq.review_notes}\n\nStripe error: ${errorMsg}` : `Stripe error: ${errorMsg}`,
      });

      return result.internalError('Stripe refund failed — request marked as failed');
    }

    const { updated, refundEventPayload } = await refundExecutionPersistenceService.persistExecutedRefund({
      organizationId: ctx.organizationId,
      requestId: opts.requestId,
      executorUserId: ctx.userId,
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
        organizationId: ctx.organizationId,
        paymentIntentId: stripePaymentIntentId,
        stripeTransferId,
        executorUserId: ctx.userId,
        requestedAmount: claimedReq.requested_amount,
        refundedAmount: refund.refundedAmount,
      });
      try {
        await addRefundReconciliationJob({
          organizationId: ctx.organizationId,
          requestId: opts.requestId,
          executorUserId: ctx.userId,
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
            organizationId: ctx.organizationId,
            paymentIntentId: stripePaymentIntentId,
            stripeTransferId,
            executorUserId: ctx.userId,
            requestedAmount: claimedReq.requested_amount,
            refundedAmount: refund.refundedAmount,
          },
        }, {
          actorId: ctx.userId,
          actorType: 'user',
          organizationId: ctx.organizationId,
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
          actorId: ctx.userId,
          actorType: 'user',
          organizationId: ctx.organizationId,
        });
      } catch (dispatchError) {
        const dispatchErrorMessage = dispatchError instanceof Error ? dispatchError.message : 'Unknown error';
        logger.error('Refund executed but failed to dispatch InvoiceRefunded for request {requestId}', {
          requestId: opts.requestId,
          invoiceId: invoice.id,
          error: dispatchErrorMessage,
        });
        try {
          await addRefundReconciliationJob({
            organizationId: ctx.organizationId,
            requestId: opts.requestId,
            executorUserId: ctx.userId,
            stripePaymentIntentId,
            stripeTransferId,
            stripeRefundId: refund.stripeRefundId,
            refundedAmount: refund.refundedAmount,
          });
          logger.warn('Queued refund reconciliation after InvoiceRefunded dispatch failure', {
            requestId: opts.requestId,
            invoiceId: invoice.id,
            refundId: refund.stripeRefundId,
          });
        } catch (queueError) {
          const queueErrorMessage = queueError instanceof Error ? queueError.message : 'Unknown error';
          logger.error('Failed to queue refund reconciliation after InvoiceRefunded dispatch failure', {
            requestId: opts.requestId,
            invoiceId: invoice.id,
            refundId: refund.stripeRefundId,
            error: queueErrorMessage,
          });

          let systemErrorDispatchMessage: string | null = null;

          try {
            await SystemErrorOccurred.dispatch({
              error: 'Refund succeeded but both InvoiceRefunded dispatch and reconciliation queueing failed',
              context: {
                requestId: opts.requestId,
                invoiceId: invoice.id,
                refundId: refund.stripeRefundId,
                dispatchError: dispatchErrorMessage,
                queueError: queueErrorMessage,
              },
            }, {
              actorId: ctx.userId,
              actorType: 'user',
              organizationId: ctx.organizationId,
            });
          } catch (systemErrorDispatch) {
            systemErrorDispatchMessage = systemErrorDispatch instanceof Error
              ? systemErrorDispatch.message
              : 'Unknown error';
            logger.error('Failed to dispatch SystemErrorOccurred after refund event/reconciliation failure', {
              requestId: opts.requestId,
              invoiceId: invoice.id,
              refundId: refund.stripeRefundId,
              error: systemErrorDispatchMessage,
            });
          }

          throw new Error(
            systemErrorDispatchMessage
              ? `Refund follow-up handling failed: dispatch=${dispatchErrorMessage}; queue=${queueErrorMessage}; system_event=${systemErrorDispatchMessage}`
              : `Refund follow-up handling failed: dispatch=${dispatchErrorMessage}; queue=${queueErrorMessage}`,
          );
        }
      }
    }

    return result.ok(updated);
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
