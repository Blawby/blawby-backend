import type { Stripe } from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stripeApiAdapter } from '@/engines/stripe/stripe-api-adapter';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';

const stripeMocks = vi.hoisted(() => ({
  createInvoice: vi.fn(),
  createInvoiceItem: vi.fn(),
  deleteInvoiceItem: vi.fn(),
  finalizeInvoice: vi.fn(),
  sendInvoice: vi.fn(),
  voidInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  retrieveInvoice: vi.fn(),
}));

vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    invoices: {
      create: stripeMocks.createInvoice,
      finalizeInvoice: stripeMocks.finalizeInvoice,
      sendInvoice: stripeMocks.sendInvoice,
      voidInvoice: stripeMocks.voidInvoice,
      del: stripeMocks.deleteInvoice,
      retrieve: stripeMocks.retrieveInvoice,
    },
    invoiceItems: {
      create: stripeMocks.createInvoiceItem,
      del: stripeMocks.deleteInvoiceItem,
    },
  },
}));

const invoice = {
  id: 'invoice-1',
  invoice_number: 'INV-1',
  due_date: null,
  notes: null,
  memo: null,
  lineItems: [
    {
      id: 'line-1',
      line_total: 12_500,
      description: 'Legal services',
    },
  ],
} as unknown as InvoiceWithRelations;

beforeEach(() => {
  vi.resetAllMocks();
  stripeMocks.createInvoice.mockResolvedValue({ id: 'in_1' } as Stripe.Invoice);
  stripeMocks.createInvoiceItem.mockResolvedValue({ id: 'ii_1' } as Stripe.InvoiceItem);
  stripeMocks.finalizeInvoice.mockResolvedValue({ id: 'in_1', status: 'open' } as Stripe.Invoice);
  stripeMocks.sendInvoice.mockResolvedValue({ id: 'in_1', status: 'open' } as Stripe.Invoice);
  stripeMocks.voidInvoice.mockResolvedValue({ id: 'in_1', status: 'void' } as Stripe.Invoice);
  stripeMocks.deleteInvoice.mockResolvedValue({ id: 'in_1', deleted: true });
  stripeMocks.retrieveInvoice.mockResolvedValue({ id: 'in_1', status: 'open' } as Stripe.Invoice);
});

describe('stripeApiAdapter platform invoice ownership', () => {
  it('creates the invoice and line items on the platform for the platform customer', async () => {
    await stripeApiAdapter.createStripeInvoice(invoice, 'cus_platform', 'acct_practice', 'invoice-send:invoice-1');

    expect(stripeMocks.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_platform',
        on_behalf_of: 'acct_practice',
      }),
      { idempotencyKey: 'invoice-send:invoice-1:invoice' }
    );
    expect(stripeMocks.createInvoiceItem).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_platform', invoice: 'in_1', amount: 12_500 }),
      { idempotencyKey: 'invoice-send:invoice-1:line-item:line-1' }
    );
  });

  it('finalizes and sends the platform invoice without a connected-account request header', async () => {
    await stripeApiAdapter.finalizeAndSendInvoice('in_1', 'acct_practice', 'invoice-send:invoice-1');

    expect(stripeMocks.finalizeInvoice).toHaveBeenCalledWith(
      'in_1',
      {},
      { idempotencyKey: 'invoice-send:invoice-1:finalize' }
    );
    expect(stripeMocks.sendInvoice).toHaveBeenCalledWith('in_1', {}, { idempotencyKey: 'invoice-send:invoice-1:send' });
  });

  it('reads, voids, and deletes platform invoices without a connected-account request header', async () => {
    await stripeApiAdapter.getStripeInvoice('in_1', 'acct_practice');
    await stripeApiAdapter.voidInvoice('in_1', 'acct_practice');
    await stripeApiAdapter.deleteDraftInvoice('in_1', 'acct_practice');

    expect(stripeMocks.retrieveInvoice).toHaveBeenCalledWith('in_1');
    expect(stripeMocks.voidInvoice).toHaveBeenCalledWith('in_1');
    expect(stripeMocks.deleteInvoice).toHaveBeenCalledWith('in_1');
  });
});
