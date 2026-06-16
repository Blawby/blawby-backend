import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['engines', 'financial', 'billing-recorder']);

interface RecordTransactionOpts {
  organizationId: string;
  payableId: string;
  payableType: 'invoice' | 'intake' | 'subscription';
  matterId: string | null;
  amount: number;
  transferId: string;
  destinationAccountId: string;
  meteredFeeCents: number;
  metadata?: Record<string, string>;
}

const record = async (opts: RecordTransactionOpts): Promise<void> => {
  const {
    organizationId,
    payableId,
    payableType,
    matterId,
    amount,
    transferId,
    destinationAccountId,
    meteredFeeCents,
    metadata,
  } = opts;

  logger.info('Recording billing transaction for {payableType} {payableId}', { payableType, payableId });

  await billingTransactionsRepository.createTransaction({
    organization_id: organizationId,
    invoice_id: payableType === 'invoice' ? payableId : null,
    matter_id: matterId,
    amount,
    metered_fee_cents: meteredFeeCents,
    type: 'payout',
    status: 'completed',
    destination_account_id: destinationAccountId,
    stripe_transfer_id: transferId,
    metadata: {
      payable_type: payableType,
      payable_id: payableId,
      ...metadata,
    },
  });
};

export const billingRecorder = { record };
