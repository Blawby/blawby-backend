import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { payoutsRepository } from '@/modules/payouts/database/queries/payouts.repository';
import type { InsertPayout } from '@/modules/payouts/database/schema/payouts.schema';

const logger = getLogger(['payouts', 'webhook-service']);

export const HANDLED_PAYOUT_EVENTS = new Set<string>([
  'payout.created',
  'payout.updated',
  'payout.paid',
  'payout.failed',
  'payout.canceled',
]);

const isStripePayout = (obj: unknown): obj is Stripe.Payout =>
  obj !== null && typeof obj === 'object' && 'object' in obj && obj.object === 'payout';

const idOrNull = (value: string | { id: string } | null): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null);

const mapPayoutToRecord = (
  payout: Stripe.Payout,
  organizationId: string,
  stripeAccountId: string,
  eventCreated: number,
): InsertPayout => ({
  organization_id: organizationId,
  stripe_account_id: stripeAccountId,
  stripe_payout_id: payout.id,
  amount: payout.amount,
  currency: payout.currency,
  status: payout.status,
  type: payout.type,
  method: payout.method,
  description: payout.description,
  statement_descriptor: payout.statement_descriptor,
  failure_code: payout.failure_code,
  failure_message: payout.failure_message,
  destination_id: idOrNull(payout.destination),
  balance_transaction_id: idOrNull(payout.balance_transaction),
  automatic: payout.automatic,
  arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
  stripe_created_at: new Date(payout.created * 1000),
  metadata: payout.metadata,
  last_stripe_event_created_at: new Date(eventCreated * 1000),
});

/**
 * Persist a `payout.*` Stripe Connect event into the payouts ledger.
 *
 * Payout events for connected accounts arrive with `event.account` set to the
 * connected account id; platform-account payouts have no `event.account` and are
 * intentionally ignored (they are not part of any practice's ledger).
 */
const processEvent = async (event: Stripe.Event): Promise<void> => {
  if (!HANDLED_PAYOUT_EVENTS.has(event.type)) {
    logger.info('Ignoring payout event type: {eventType}', { eventType: event.type });
    return;
  }

  const payout = event.data.object;
  if (!isStripePayout(payout)) {
    logger.warn('Received payout event without a payout object: {eventType}', { eventType: event.type });
    return;
  }

  const stripeAccountId = event.account;
  if (!stripeAccountId) {
    logger.info('Skipping payout {payoutId}: event has no connected account', { payoutId: payout.id });
    return;
  }

  const connectedAccount = await onboardingRepository.findByStripeAccountId(stripeAccountId);
  if (!connectedAccount) {
    logger.warn('Skipping payout {payoutId}: no connected account found for {stripeAccountId}', {
      payoutId: payout.id,
      stripeAccountId,
    });
    return;
  }

  const record = mapPayoutToRecord(payout, connectedAccount.organization_id, stripeAccountId, event.created);
  const result = await payoutsRepository.upsertByStripePayoutId(record);

  if (!result) {
    logger.info('Skipping stale payout event {payoutId}: event older than stored state', { payoutId: payout.id });
    return;
  }

  logger.info('Recorded payout {payoutId} ({status}) for organization {organizationId}', {
    payoutId: payout.id,
    status: payout.status,
    organizationId: connectedAccount.organization_id,
  });
};

export const payoutsWebhookService = { processEvent } as const;
