import type { SelectPayout } from '@/modules/payouts/database/schema/payouts.schema';
import type {
  PayoutDetailResponse,
  PayoutResponse,
  PayoutTransactionResponse,
} from '@/modules/payouts/schemas/payouts.validation';
import type { OffsetPaginatedResponse } from '@/shared/types/pagination';

export interface PayoutDetailServiceResult {
  payout: SelectPayout;
  transactions: PayoutTransactionResponse[];
  transactions_has_more: boolean;
}

const toIsoOrNull = (value: Date | null): string | null => (value ? value.toISOString() : null);

export const serializePayout = (payout: SelectPayout): PayoutResponse => ({
  id: payout.id,
  stripe_payout_id: payout.stripe_payout_id,
  stripe_account_id: payout.stripe_account_id,
  amount: payout.amount,
  currency: payout.currency,
  status: payout.status,
  type: payout.type,
  method: payout.method,
  description: payout.description,
  statement_descriptor: payout.statement_descriptor,
  failure_code: payout.failure_code,
  failure_message: payout.failure_message,
  destination_id: payout.destination_id,
  automatic: payout.automatic,
  arrival_date: toIsoOrNull(payout.arrival_date),
  stripe_created_at: payout.stripe_created_at.toISOString(),
  created_at: payout.created_at.toISOString(),
  updated_at: payout.updated_at.toISOString(),
});

export const serializePayoutDetail = ({
  payout,
  transactions,
  transactions_has_more,
}: PayoutDetailServiceResult): PayoutDetailResponse => ({
  ...serializePayout(payout),
  balance_transaction_id: payout.balance_transaction_id,
  metadata: payout.metadata ?? null,
  transactions,
  transactions_has_more,
});

export const serializePaginatedPayouts = (
  response: OffsetPaginatedResponse<SelectPayout>
): OffsetPaginatedResponse<PayoutResponse> => ({
  data: response.data.map(serializePayout),
  pagination: response.pagination,
});
