import { getLogger } from '@logtape/logtape';
import type { TransferInstruction } from '@/engines/financial/types';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['engines', 'financial', 'transfer-executor']);

interface ExecuteTransferOpts {
  amount: number;
  currency?: string;
  routing: TransferInstruction;
}

interface TransferResult {
  transferId: string | null;
  held: boolean;
}

const execute = async (opts: ExecuteTransferOpts): Promise<TransferResult> => {
  const { amount, currency = 'usd', routing } = opts;

  if (routing.holdForApproval) {
    logger.info('Transfer held for approval, skipping Stripe transfer');
    return { transferId: null, held: true };
  }

  const transfer = await stripe.transfers.create({
    amount,
    currency,
    destination: routing.destination,
    metadata: routing.metadata,
  });

  logger.info('Created Stripe transfer {transferId}', { transferId: transfer.id });
  return { transferId: transfer.id, held: false };
};

export const transferExecutor = { execute };
