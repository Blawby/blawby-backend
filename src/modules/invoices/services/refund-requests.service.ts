import { eq, and } from 'drizzle-orm';
import { getLogger } from '@logtape/logtape';

import { stripe } from '@/shared/utils/stripe-client';

import { refundRequestsQueries } from '@/modules/invoices/database/queries/refund-requests.queries';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import { result } from '@/shared/utils/result';
import { db } from '@/shared/database';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';

import type { SelectRefundRequest } from '@/modules/invoices/database/schema/refund-requests.schema';
import type { Result } from '@/shared/types/result';

const logger = getLogger(['invoices', 'refund-requests']);

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
      const existingRefundSum = existingRefunds
        .filter((r) => ['requested', 'approved', 'executed'].includes(r.status))
        .reduce((sum, r) => sum + (r.status === 'executed' ? (r.executed_amount ?? r.requested_amount) : r.requested_amount), 0);

      // Validate amount does not exceed amount_paid
      if (opts.requestedAmount + existingRefundSum > (invoice.amount_paid ?? 0)) {
        return result.badRequest('Requested refund amount plus existing refunds exceeds amount paid');
      }

      const req = await refundRequestsQueries.create({
        organization_id: opts.organizationId,
        invoice_id: opts.invoiceId,
        client_user_details_id: clientUserDetailsId,
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

    const req = await refundRequestsQueries.findByIdAndClient(
      opts.requestId,
      opts.organizationId,
      clientResult.data,
    );
    if (!req) return result.notFound('Refund request not found');
    if (req.status !== 'requested') {
      return result.badRequest('Only pending refund requests can be cancelled');
    }

    const updated = await refundRequestsQueries.update(opts.requestId, opts.organizationId, {
      status: 'cancelled',
    });
    if (!updated) return result.notFound('Refund request not found');
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
  filters?: { status?: string; invoice_id?: string },
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
    const req = await refundRequestsQueries.findById(opts.requestId, opts.organizationId);
    if (!req) return result.notFound('Refund request not found');
    if (req.status !== 'requested') {
      return result.badRequest('Only pending refund requests can be reviewed');
    }

    const updated = await refundRequestsQueries.update(opts.requestId, opts.organizationId, {
      status: opts.action,
      reviewed_by_user_id: opts.reviewerUserId,
      reviewed_at: new Date(),
      review_notes: opts.reviewNotes,
    });
    if (!updated) return result.notFound('Refund request not found');
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
    const req = await refundRequestsQueries.findById(opts.requestId, opts.organizationId);
    if (!req) return result.notFound('Refund request not found');
    if (req.status !== 'approved') {
      return result.badRequest('Only approved refund requests can be executed');
    }

    // We need the Stripe payment intent ID from the invoice
    const invoice = await invoicesRepository.findInvoiceById(req.invoice_id, opts.organizationId);
    if (!invoice) return result.notFound('Invoice not found');

    const stripePaymentIntentId = invoice.stripe_payment_intent_id;
    if (!stripePaymentIntentId) {
      return result.badRequest('Invoice has no Stripe payment intent ID — cannot refund');
    }

    // Resolve the connected account for the refund
    const stripeAccountId = invoice.connectedAccount?.stripe_account_id;
    if (!stripeAccountId) {
      return result.badRequest('Invoice has no connected Stripe account');
    }

    try {
      // Proceed with external Stripe API request before updating local status to 'executed'.

      const refund = await stripe.refunds.create({
        payment_intent: stripePaymentIntentId,
        amount: req.requested_amount,
        metadata: {
          refund_request_id: req.id,
          invoice_id: req.invoice_id,
          organization_id: opts.organizationId,
        },
      }, {
        stripeAccount: stripeAccountId,
        idempotencyKey: `refund_request_${opts.requestId}`,
      });

      const updated = await refundRequestsQueries.update(opts.requestId, opts.organizationId, {
        status: 'executed',
        stripe_refund_id: refund.id,
        stripe_payment_intent_id: stripePaymentIntentId,
        executed_amount: refund.amount,
        executed_at: new Date(),
        executed_by_user_id: opts.executorUserId,
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
      const isTransient = stripeError instanceof Error && (
        stripeError.name === 'APIConnectionError' ||
        stripeError.name === 'RateLimitError' ||
        (stripeError as any).code === 'ECONNRESET' ||
        (stripeError as any).code === 'ETIMEDOUT'
      );

      if (isTransient) {
        logger.error('Stripe refund transient error for request {requestId}: {error}', {
          requestId: opts.requestId,
          executorUserId: opts.executorUserId,
          error: errorMsg,
        });
        return result.internalError('Stripe refund transient error — please retry later');
      }

      // Mark as failed but preserve the request
      await refundRequestsQueries.update(opts.requestId, opts.organizationId, {
        status: 'failed',
        executed_by_user_id: opts.executorUserId,
        executed_at: new Date(),
        review_notes: req.review_notes ? `${req.review_notes}\n\nStripe error: ${errorMsg}` : `Stripe error: ${errorMsg}`,
      });

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
