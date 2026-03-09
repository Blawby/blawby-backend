import { eq, and } from 'drizzle-orm';
import { getLogger } from '@logtape/logtape';
import Stripe from 'stripe';

import { stripe } from '@/shared/utils/stripe-client';
import { InvoiceRefunded } from '@/shared/events/definitions';

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

// ──────────────────────────────────────────────────────────────────────────
// CLIENT ACTIONS
// ──────────────────────────────────────────────────────────────────────────

/**
 * Client creates a refund request for a paid invoice.
 * Client identity is resolved server-side from their userId.
 */
const createRequest = async (opts: {
  organizationId: string;
  invoiceId: string;
  userId: string;
  requestedAmount: number; // cents
  reason: string;
  notes?: string;
}): Promise<Result<SelectRefundRequest>> => {
  try {
    // Resolve userId → userDetails.id
    const clientResult = await invoiceClientResolver.resolveUserDetailId(opts.organizationId, opts.userId);
    if (!clientResult.success) return clientResult;
    const clientUserDetailsId = clientResult.data;

    return await db.transaction(async (tx) => {
      // Lock the invoice row to prevent concurrent refund total races
      await tx.select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.id, opts.invoiceId), eq(invoices.organization_id, opts.organizationId)))
        .for('update');

      // Verify invoice belongs to this client and is paid
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
      const hasOpenRequest = existingRefunds.some((r) => blockingStatuses.includes(r.status));
      if (hasOpenRequest) {
        return result.badRequest('An open refund request already exists for this invoice');
      }

      const reservedStatuses: ReadonlyArray<SelectRefundRequest['status']> = ['requested', 'approved', 'executing', 'executed'];
      const reservedAmount = existingRefunds
        .filter((refundRequest) => reservedStatuses.includes(refundRequest.status))
        .reduce((sum, refundRequest) => (
          sum + (refundRequest.executed_amount ?? refundRequest.requested_amount)
        ), 0);
      const amountPaid = invoice.amount_paid ?? 0;
      const remainingRefundable = Math.max(0, amountPaid - reservedAmount);

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

      logger.info('Refund request {id} created for invoice {invoiceId}', {
        id: req.id,
        invoiceId: opts.invoiceId,
      });

      return result.ok(req);
    });
  } catch (error) {
    logger.error('Failed to create refund request: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return result.internalError('Failed to create refund request');
  }
};

/**
 * Client lists their own refund requests for this org.
 */
const listClientRequests = async (
  organizationId: string,
  userId: string,
): Promise<Result<SelectRefundRequest[]>> => {
  try {
    const clientResult = await invoiceClientResolver.resolveUserDetailId(organizationId, userId);
    if (!clientResult.success) return clientResult;
    const requests = await refundRequestsQueries.listByClient(organizationId, clientResult.data);
    return result.ok(requests);
  } catch (error) {
    logger.error('Failed to list refund requests', { error });
    return result.internalError('Failed to list refund requests');
  }
};

/**
 * Client cancels a pending refund request (only allowed in 'requested' status).
 */
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

// ──────────────────────────────────────────────────────────────────────────
// PRACTICE ACTIONS
// ──────────────────────────────────────────────────────────────────────────

/**
 * Practice lists all refund requests for their organization.
 */
const listPracticeRequests = async (
  organizationId: string,
  filters?: { status?: string; invoice_id?: string; client_user_details_id?: string },
): Promise<Result<SelectRefundRequest[]>> => {
  try {
    const requests = await refundRequestsQueries.listByOrganization(organizationId, filters);
    return result.ok(requests);
  } catch (error) {
    logger.error('Failed to list refund requests', { error });
    return result.internalError('Failed to list refund requests');
  }
};

/**
 * Practice approves or rejects a refund request.
 */
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

/**
 * Practice executes an approved refund via Stripe.
 * Stores stripe_refund_id and transitions status to 'executed' or 'failed'.
 */
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

    // We need the Stripe payment intent ID from the invoice
    const invoice = await invoicesRepository.findInvoiceById(claimedReq.invoice_id, opts.organizationId);
    if (!invoice) {
      // Revert status before returning
      try {
        await refundRequestsQueries.transitionStatus(opts.requestId, opts.organizationId, 'executing', { status: 'approved' });
      } catch (rollbackError) {
        logger.error('Failed to rollback refund request status from executing to approved after invoice not found', {
          requestId: opts.requestId,
          organizationId: opts.organizationId,
          status: 'executing',
          error: rollbackError instanceof Error ? rollbackError.message : 'Unknown error',
        });
      }
      return result.notFound('Invoice not found');
    }

    const stripePaymentIntentId = invoice.stripe_payment_intent_id;
    if (!stripePaymentIntentId) {
      // Revert status before returning
      try {
        await refundRequestsQueries.transitionStatus(opts.requestId, opts.organizationId, 'executing', { status: 'approved' });
      } catch (rollbackError) {
        logger.error('Failed to rollback refund request status from executing to approved after missing stripe payment intent ID', {
          requestId: opts.requestId,
          organizationId: opts.organizationId,
          status: 'executing',
          error: rollbackError instanceof Error ? rollbackError.message : 'Unknown error',
        });
      }
      return result.badRequest('Invoice has no Stripe payment intent ID — cannot refund');
    }

    try {
      // Proceed with external Stripe API request before updating local status to 'executed'.
      const invoiceTxs = await billingTransactionsRepository.listByInvoiceId(invoice.id);
      let stripeTransferId = invoice.stripe_transfer_id;
      if (!stripeTransferId) {
        stripeTransferId = invoiceTxs.find((tx) => tx.type === 'payout' && !!tx.stripe_transfer_id)?.stripe_transfer_id ?? null;
      }

      if (!stripeTransferId) {
        logger.warn('Executing refund request {requestId} without transfer reversal; no Stripe transfer ID found for invoice {invoiceId}', {
          requestId: opts.requestId,
          invoiceId: invoice.id,
        });
      }

      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: stripePaymentIntentId,
        amount: claimedReq.requested_amount,
        metadata: {
          refund_request_id: claimedReq.id,
          invoice_id: claimedReq.invoice_id,
          organization_id: opts.organizationId,
          ...(stripeTransferId ? { stripe_transfer_id: stripeTransferId } : {}),
        },
        ...(stripeTransferId
          ? {
              reverse_transfer: true,
            }
          : {}),
      };

      const refund = await stripe.refunds.create(refundParams, {
        idempotencyKey: `refund_request_${opts.requestId}`,
      });

      const priorRefunds = await refundRequestsQueries.listByOrganization(
        opts.organizationId,
        { invoice_id: invoice.id },
      );
      const alreadyRefundedCents = priorRefunds
        .filter((refundRequest) => refundRequest.id !== claimedReq.id && refundRequest.status === 'executed')
        .reduce((sum, refundRequest) => sum + (refundRequest.executed_amount ?? 0), 0);
      const cumulativeRefundedCents = alreadyRefundedCents + refund.amount;
      const creditInvoiceFee = cumulativeRefundedCents >= invoice.amount_paid;

      const originalPayoutMeteredFeeCents = getPayoutMeteredFeeCents(invoiceTxs)
        || Math.round(invoice.amount_paid * PLATFORM_VARIABLE_FEE_RATE);
      const payoutFeeCreditCents = invoice.amount_paid > 0
        ? Math.min(
            originalPayoutMeteredFeeCents,
            Math.round((originalPayoutMeteredFeeCents * refund.amount) / invoice.amount_paid),
          )
        : 0;

      const updated = await db.transaction(async (tx) => {
        const executedRequest = await refundRequestsQueries.transitionStatus(opts.requestId, opts.organizationId, 'executing', {
          status: 'executed',
          stripe_refund_id: refund.id,
          stripe_payment_intent_id: stripePaymentIntentId,
          executed_amount: refund.amount,
          executed_at: new Date(),
          executed_by_user_id: opts.executorUserId,
        }, tx);

        if (!executedRequest) {
          return null;
        }

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
        } else {
          logger.warn('Skipping refund billing transaction audit for refund request {requestId}; destination account id unavailable', {
            requestId: opts.requestId,
            invoiceId: invoice.id,
          });
        }

        await InvoiceRefunded.dispatch({
          invoice_id: invoice.id,
          organization_id: opts.organizationId,
          refund_request_id: claimedReq.id,
          refunded_amount: refund.amount,
          payout_fee_credit_cents: payoutFeeCreditCents,
          credit_invoice_fee: creditInvoiceFee,
        }, {
          actorId: opts.executorUserId,
          actorType: 'user',
          organizationId: opts.organizationId,
          tx,
          critical: true,
        });

        return executedRequest;
      });

      logger.info('Stripe refund {refundId} executed for request {requestId}', {
        refundId: refund.id,
        requestId: opts.requestId,
      });

      if (!updated) {
        logger.error('Partial success: Stripe refund {refundId} executed but failed to update local DB for request {requestId}', {
          refundId: refund.id,
          requestId: opts.requestId,
        });
        return result.internalError(`Stripe refund ${refund.id} completed, but local DB update failed`);
      }
      return result.ok(updated);
    } catch (stripeError) {
      const errorMsg = stripeError instanceof Error ? stripeError.message : 'Unknown error';
      const isTransient = (isStripeError(stripeError) && (
        stripeError.type === 'StripeConnectionError' ||
        stripeError.type === 'StripeRateLimitError' ||
        stripeError.code === 'ECONNRESET' ||
        stripeError.code === 'ETIMEDOUT'
      )) || (stripeError instanceof Error && (
        (stripeError as any).code === 'ECONNRESET' ||
        (stripeError as any).code === 'ETIMEDOUT'
      ));

      if (isTransient) {
        const rolledBack = await refundRequestsQueries.transitionStatus(
          opts.requestId,
          opts.organizationId,
          'executing',
          { status: 'approved' },
        );
        if (!rolledBack) {
          logger.error('Failed to rollback transient refund request {requestId} from executing to approved', {
            requestId: opts.requestId,
            organizationId: opts.organizationId,
          });
        }

        logger.error('Stripe refund transient error for request {requestId}: {error}', {
          requestId: opts.requestId,
          executorUserId: opts.executorUserId,
          error: errorMsg,
        });
        return result.internalError('Stripe refund transient error — please retry later');
      }

      // Mark as failed but preserve the request
      const transitioned = await refundRequestsQueries.transitionStatus(opts.requestId, opts.organizationId, 'executing', {
        status: 'failed',
        executed_by_user_id: opts.executorUserId,
        executed_at: new Date(),
        review_notes: claimedReq.review_notes ? `${claimedReq.review_notes}\n\nStripe error: ${errorMsg}` : `Stripe error: ${errorMsg}`,
      });

      if (!transitioned) {
        logger.error('Failed to transition refund request {requestId} to failed state after Stripe error', {
          requestId: opts.requestId,
          organizationId: opts.organizationId,
          executorUserId: opts.executorUserId,
          errorMsg,
        });
        return result.internalError('Stripe refund failed, but local DB could not transition to failed state');
      }

      logger.error('Stripe refund failed for request {requestId}: {error}', {
        requestId: opts.requestId,
        error: errorMsg,
      });

      return result.internalError('Stripe refund failed — request marked as failed');
    }
  } catch (error) {
    logger.error('Failed to execute refund', { error });
    return result.internalError('Failed to execute refund');
  }
};

export const refundRequestsService = {
  // Client
  createRequest,
  listClientRequests,
  cancelRequest,
  // Practice
  listPracticeRequests,
  reviewRequest,
  executeRefund,
};
