import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import type { SelectBillingTransaction } from '@/modules/invoices/database/schema/billing-transactions.schema';
import type { InvoiceLineItemInput, InvoiceTotals } from '@/modules/invoices/types/invoices.types';
import type { db } from '@/shared/database';

export const calculateInvoiceTotals = (lineItems: InvoiceLineItemInput[], amount_paid = 0): InvoiceTotals => {
  const subtotal = lineItems.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
  // Tax and discounts are intentionally fixed to zero until those rules exist.
  const total = subtotal;
  const amount_due = total - amount_paid;

  return { subtotal, tax_amount: 0, discount_amount: 0, total, amount_due };
};

export const extractPayoutMeteredFeeCents = (invoiceTxs: SelectBillingTransaction[]): number | null => {
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

export const requirePayoutMeteredFeeCents = (invoiceTxs: SelectBillingTransaction[], invoiceId: string): number => {
  const meteredFeeCents = extractPayoutMeteredFeeCents(invoiceTxs);
  if (typeof meteredFeeCents === 'number') {
    return meteredFeeCents;
  }

  throw new Error(`Missing persisted payout metered fee for invoice ${invoiceId}`);
};

export const loadRequiredPayoutMeteredFeeCents = async (invoiceId: string, tx?: typeof db): Promise<number> => {
  const invoiceTxs = await billingTransactionsRepository.listByInvoiceId(invoiceId, tx);
  return requirePayoutMeteredFeeCents(invoiceTxs, invoiceId);
};
