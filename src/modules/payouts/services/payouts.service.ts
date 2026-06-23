import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import type { Stripe } from 'stripe';
import { payoutsRepository } from '@/modules/payouts/database/queries/payouts.repository';
import type { SelectPayout } from '@/modules/payouts/database/schema/payouts.schema';
import type { ListPayoutsQuery, PayoutTransactionResponse } from '@/modules/payouts/schemas/payouts.validation';
import type { PayoutDetailServiceResult } from '@/modules/payouts/serializers/payout.serializer';
import type { OffsetPaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['payouts', 'service']);

// Stripe returns at most 100 balance transactions per page; one page is enough
// to summarize a settlement batch without paginating Stripe.
const MAX_TRANSACTIONS = 100;

const toBalanceTransactionResponse = (bt: Stripe.BalanceTransaction): PayoutTransactionResponse => ({
  id: bt.id,
  type: bt.type,
  amount: bt.amount,
  fee: bt.fee,
  net: bt.net,
  currency: bt.currency,
  description: bt.description,
  source: typeof bt.source === 'string' ? bt.source : (bt.source?.id ?? null),
  created: new Date(bt.created * 1000).toISOString(),
});

/**
 * List payouts (the ledger) for the active practice, newest settlement batch first.
 */
const listPayouts = async (
  { filters }: { filters: ListPayoutsQuery },
  ctx: ServiceContext
): Promise<OffsetPaginatedResponse<SelectPayout>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Payout');

  const { payouts, total } = await payoutsRepository.listByOrganization(ctx.organizationId, filters);

  return {
    data: payouts,
    pagination: { page: filters.page, limit: filters.limit, total },
  };
};

/**
 * Get a single payout with the balance transactions that settled in that batch.
 * The payout record is stored locally (via webhooks); the line items are fetched
 * live from Stripe since they are not delivered in the webhook payload.
 */
const getPayoutDetail = async ({ id }: { id: string }, ctx: ServiceContext): Promise<PayoutDetailServiceResult> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Payout');

  const payout = await payoutsRepository.findByIdAndOrganization(id, ctx.organizationId);
  if (!payout) {
    throw new HTTPException(404, { message: 'Payout not found' });
  }

  let transactions: PayoutTransactionResponse[] = [];
  let transactionsHasMore = false;

  try {
    const balanceTransactions = await stripe.balanceTransactions.list(
      { payout: payout.stripe_payout_id, limit: MAX_TRANSACTIONS },
      { stripeAccount: payout.stripe_account_id }
    );
    transactions = balanceTransactions.data.map(toBalanceTransactionResponse);
    transactionsHasMore = balanceTransactions.has_more;
  } catch (error) {
    logger.error('Failed to fetch balance transactions for payout {payoutId}: {error}', {
      payoutId: payout.stripe_payout_id,
      organizationId: ctx.organizationId,
      error,
    });
    throw new HTTPException(502, { message: 'Failed to retrieve payout transactions from Stripe' });
  }

  return { payout, transactions, transactions_has_more: transactionsHasMore };
};

export const payoutsService = {
  listPayouts,
  getPayoutDetail,
};
