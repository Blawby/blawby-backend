import { getLogger } from '@logtape/logtape';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '@/schema';
import { trustService } from '@/modules/trust/services/trust.service';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';

const logger = getLogger(['engines', 'financial', 'retainer-payment-flow']);

interface RecordDepositOpts {
  organizationId: string;
  clientId: string;
  matterId: string;
  amount: number;
  invoiceId?: string;
}

interface RecordWithdrawalOpts {
  organizationId: string;
  clientId: string;
  matterId: string;
  amount: number;
  reason: string;
}

const recordDeposit = async (opts: RecordDepositOpts, tx?: NodePgDatabase<typeof schema>): Promise<void> => {
  const { organizationId, clientId, matterId, amount, invoiceId } = opts;

  logger.info('Recording retainer deposit: {matterId} {amount}', {
    matterId,
    amount,
    invoiceId,
  });

  const depositResult = await trustService.recordDeposit(
    {
      organizationId,
      clientId,
      matterId,
      amount,
      invoiceId,
      source: 'stripe_payment',
      description: invoiceId ? `Retainer deposit — invoice ${invoiceId}` : 'Retainer deposit — refund reversal',
      createdBy: 'webhook',
    },
    tx
  );

  if (!depositResult.success) {
    throw new Error(depositResult.error?.message || 'Failed to record retainer deposit');
  }

  // Update matter's retainer_balance cache
  const balanceResult = await trustService.getBalanceWithTx({ organizationId, clientId }, tx);

  if (!balanceResult.success) {
    throw new Error('Failed to retrieve trust balance after deposit');
  }

  const matterBalance = balanceResult.data.byMatter.find((m) => m.matter_id === matterId)?.balance ?? 0;

  await mattersQueries.updateRetainerBalance(matterId, matterBalance, tx);

  logger.info('Retainer deposit recorded and balance updated: {matterId}', { matterId, newBalance: matterBalance });
};

const recordWithdrawal = async (opts: RecordWithdrawalOpts, tx?: NodePgDatabase<typeof schema>): Promise<void> => {
  const { organizationId, clientId, matterId, amount, reason } = opts;

  logger.info('Recording retainer withdrawal: {matterId} {amount}', {
    matterId,
    amount,
    reason,
  });

  const withdrawalResult = await trustService.recordWithdrawal(
    {
      organizationId,
      clientId,
      matterId,
      amount,
      source: 'system_billing',
      description: reason,
      createdBy: 'webhook',
    },
    tx
  );

  if (!withdrawalResult.success) {
    throw new Error(withdrawalResult.error?.message || 'Failed to record retainer withdrawal');
  }

  // Update matter's retainer_balance cache
  const balanceResult = await trustService.getBalanceWithTx({ organizationId, clientId }, tx);

  if (!balanceResult.success) {
    throw new Error('Failed to retrieve trust balance after withdrawal');
  }

  const matterBalance = balanceResult.data.byMatter.find((m) => m.matter_id === matterId)?.balance ?? 0;

  await mattersQueries.updateRetainerBalance(matterId, matterBalance, tx);

  logger.info('Retainer withdrawal recorded and balance updated: {matterId}', { matterId, newBalance: matterBalance });
};

const revertRefund = async (
  opts: {
    organizationId: string;
    clientId: string;
    matterId: string;
    amount: number;
    refundRequestId: string;
  },
  tx?: NodePgDatabase<typeof schema>
): Promise<void> => {
  const { organizationId, clientId, matterId, amount, refundRequestId } = opts;

  logger.info('Reverting refund to retainer: {matterId} {amount}', { matterId, amount });

  await recordDeposit(
    {
      organizationId,
      clientId,
      matterId,
      amount,
    },
    tx
  );
};

export const retainerPaymentFlow = {
  recordDeposit,
  recordWithdrawal,
  revertRefund,
};
