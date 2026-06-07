import { getLogger } from '@logtape/logtape';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '@/schema';
import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';

const logger = getLogger(['engines', 'financial', 'billing-recorder']);

interface RecordTransactionOpts {
  organizationId: string;
  payableId: string;
  payableType: 'invoice' | 'intake' | 'subscription';
  matterId: string | null;
  amount: number;
  transferId: string;
  destinationAccountId: string;
  metadata?: Record<string, string>;
}

const record = async (opts: RecordTransactionOpts, tx?: NodePgDatabase<typeof schema>): Promise<void> => {
  const { organizationId, payableId, payableType, matterId, amount, transferId, destinationAccountId, metadata } = opts;

  logger.info('Recording billing transaction for {payableType} {payableId}', { payableType, payableId });

  await billingTransactionsRepository.createTransaction({
    organization_id: organizationId,
    invoice_id: payableType === 'invoice' ? payableId : null,
    matter_id: matterId,
    amount,
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
