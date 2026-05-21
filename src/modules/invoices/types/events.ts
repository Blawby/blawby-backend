export type InvoiceStripePaymentReceivedPayload = {
  invoice_id: string;
  organization_id: string;
  stripe_invoice_id: string;
  stripe_amount_paid: number;
  stripe_amount_remaining: number;
  stripe_paid_at: string | null;
  stripe_customer_id: string | null;
  stripe_on_behalf_of: string | null;
};

import { BaseEvent } from '@/shared/events/event';

export class InvoiceStripePaymentReceived extends BaseEvent<InvoiceStripePaymentReceivedPayload> {
  static readonly type = 'invoice:stripe_payment_received';
}
