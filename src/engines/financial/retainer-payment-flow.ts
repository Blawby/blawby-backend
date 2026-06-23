import { getLogger } from '@logtape/logtape';
import { trustService } from '@/modules/trust/services/trust.service';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import type { RecordDepositOpts, RecordWithdrawalOpts } from '@/engines/financial/types';

const logger = getLogger(['engines', 'financial', 'retainer-payment-flow']);

const recordDeposit = async (opts: RecordDepositOpts): Promise<void> => {
  const { organizationId, clientId, matterId, amount, invoiceId } = opts;

  logger.info('Recording retainer deposit: {matterId} {amount}', {
    matterId,
    amount,
    invoiceId,
  });

  await trustService.recordDeposit({
    organizationId,
    clientId,
    matterId,
    amount,
    invoiceId,
    source: 'stripe_payment',
    description: invoiceId ? `Retainer deposit — invoice ${invoiceId}` : 'Retainer deposit — refund reversal',
    createdBy: 'webhook',
  });

  // Update matter's retainer_balance cache
  const balance = await trustService.getBalanceWithTx({ organizationId, clientId });
  const matterBalance = balance.byMatter.find((m) => m.matter_id === matterId)?.balance ?? 0;

  await mattersQueries.updateRetainerBalance(matterId, matterBalance);

  logger.info('Retainer deposit recorded and balance updated: {matterId}', { matterId, newBalance: matterBalance });
};

const recordWithdrawal = async (opts: RecordWithdrawalOpts): Promise<void> => {
  const { organizationId, clientId, matterId, amount, reason } = opts;

  logger.info('Recording retainer withdrawal: {matterId} {amount}', {
    matterId,
    amount,
    reason,
  });

  await trustService.recordWithdrawal({
    organizationId,
    clientId,
    matterId,
    amount,
    source: 'system_billing',
    description: reason,
    createdBy: 'webhook',
  });

  // Update matter's retainer_balance cache
  const balance = await trustService.getBalanceWithTx({ organizationId, clientId });
  const matterBalance = balance.byMatter.find((m) => m.matter_id === matterId)?.balance ?? 0;

  await mattersQueries.updateRetainerBalance(matterId, matterBalance);

  logger.info('Retainer withdrawal recorded and balance updated: {matterId}', { matterId, newBalance: matterBalance });
};

const revertRefund = async (opts: {
  organizationId: string;
  clientId: string;
  matterId: string;
  amount: number;
  refundRequestId: string;
}): Promise<void> => {
  const { organizationId, clientId, matterId, amount } = opts;

  logger.info('Reverting refund to retainer: {matterId} {amount}', { matterId, amount });

  await recordDeposit({
    organizationId,
    clientId,
    matterId,
    amount,
  });
};

export const retainerPaymentFlow = {
  recordDeposit,
  recordWithdrawal,
  revertRefund,
};
