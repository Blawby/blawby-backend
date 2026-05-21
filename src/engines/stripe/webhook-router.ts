// src/engines/stripe/webhook-router.ts
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

const processStripeWebhook = async (_event: unknown, _ctx: ServiceContext): Promise<void> => {
  // TODO: Implement webhook routing
};

const handleInvoicePaid = async (_stripeInvoiceId: string, _ctx: ServiceContext): Promise<void> => {
  // TODO: Call InvoicePaymentOrchestrator.processPayment()
};

/**
 * Webhook Router
 *
 * Usage:
 *   await webhookRouter.processStripeWebhook(event, ctx);
 */
export const webhookRouter = {
  processStripeWebhook,
  handleInvoicePaid,
};
