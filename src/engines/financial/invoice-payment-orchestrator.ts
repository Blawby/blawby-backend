// Src/engines/financial/invoice-payment-orchestrator.ts
import { getLogger } from '@logtape/logtape';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['engines', 'financial', 'invoice-payment-orchestrator']);

/**
 * Invoice Payment Orchestrator — consolidated payment processing logic
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

const processPayment = async (_opts: ProcessPaymentOpts): Promise<void> => {
  const { stripeInvoiceId, organizationId } = _opts;

  logger.info('Processing invoice payment: {invoiceId}', {
    invoiceId: stripeInvoiceId,
    organizationId,
  });

  // TODO: Implement full orchestration
  // 1. Fetch Stripe invoice details
  // 2. Find invoice in DB
  // 3. Determine fund routing using FundManagement
  // 4. Update invoice status to paid
  // 5. Emit InvoicePaid event (listeners handle trust deposits, emails, audit, billing)
  // 6. Emit AuditLogEvent for compliance
};

/**
 * Invoice Payment Orchestrator
 *
 * Usage:
 *   await InvoicePaymentOrchestrator.processPayment({ stripeInvoiceId, organizationId, ctx });
 */
export const invoicePaymentOrchestrator = {
  processPayment,
};
