import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import type { SelectBillingTransaction } from '@/modules/invoices/database/schema/billing-transactions.schema';
import { db } from '@/shared/database';

const extractPayoutMeteredFeeCents = (invoiceTxs: SelectBillingTransaction[]): number | null => {
  const payoutTx = invoiceTxs.find((tx) => tx.type === 'payout');
  if (!payoutTx) {
    return null;
  }

  if (typeof payoutTx.metered_fee_cents === 'number' && payoutTx.metered_fee_cents > 0) {
    return payoutTx.metered_fee_cents;
  }

  const metadataFee = (payoutTx.metadata as Record<string, unknown> | null | undefined)?.metered_fee_cents;
  return typeof metadataFee === 'number' && metadataFee > 0 ? metadataFee : null;
};

export const requirePayoutMeteredFeeCents = (
  invoiceTxs: SelectBillingTransaction[],
  invoiceId: string,
): number => {
  const meteredFeeCents = extractPayoutMeteredFeeCents(invoiceTxs);
  if (typeof meteredFeeCents === 'number') {
    return meteredFeeCents;
  }

  throw new Error(`Missing persisted payout metered fee for invoice ${invoiceId}`);
};

export const loadRequiredPayoutMeteredFeeCents = async (
  invoiceId: string,
  tx?: typeof db,
): Promise<number> => {
  const invoiceTxs = await billingTransactionsRepository.listByInvoiceId(invoiceId, tx);
  return requirePayoutMeteredFeeCents(invoiceTxs, invoiceId);
};
