/**
 * Payouts Module
 *
 * Practice-facing payout ledger / reporting. Payout records (settlement batches)
 * are persisted from Stripe Connect `payout.*` webhooks and exposed via list and
 * detail endpoints, where detail includes the balance transactions that settled in
 * the batch (fetched live from Stripe).
 */

export { default as payoutsApp } from './http';
export { payoutsService } from './services/payouts.service';
export { payoutsWebhookService } from './services/payouts.webhook.service';
export { payoutValidations } from './schemas/payouts.validation';
