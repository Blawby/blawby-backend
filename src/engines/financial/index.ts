/**
 * Financial Processing Engines
 *
 * Single object exports for fund routing, payment orchestration, refunds, and retainer management.
 * All logic grouped by concern: fundManagement, invoicePaymentOrchestrator, etc.
 */

export { fundManagement } from './fund-management';
export { invoicePaymentOrchestrator } from './invoice-payment-orchestrator';
export { retainerPaymentFlow } from './retainer-payment-flow';
export { refundEngine } from './refund-engine';
export { paymentProcessor } from './payment-processor';

// Types
export type { FundRoutingInvoice, FundDestination, TransferInstruction, RefundEventPayload } from './types';
