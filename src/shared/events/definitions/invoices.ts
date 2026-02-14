import { BaseEvent } from '../event';

// ═══════════════════════════════════════════════════════════════════════════
// INVOICE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class InvoiceCreated extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  client_id: string;
  matter_id: string | null;
  invoice_number: string;
  total: number;
}> {
  static type = 'invoice.created' as const;
}

export class InvoiceUpdated extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  changes: Record<string, unknown>;
}> {
  static type = 'invoice.updated' as const;
}

export class InvoiceSent extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  client_id: string;
  stripe_invoice_id: string;
  stripe_hosted_invoice_url: string;
  total: number;
}> {
  static type = 'invoice.sent' as const;
}

export class InvoicePaid extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  matter_id: string | null;
  stripe_invoice_id: string;
  amount_paid: number;
  retainer_deducted: boolean;
  retainer_amount_deducted?: number;
}> {
  static type = 'invoice.paid' as const;
}

export class InvoicePaymentFailed extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  stripe_invoice_id: string;
}> {
  static type = 'invoice.payment_failed' as const;
}

export class InvoiceVoided extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  stripe_invoice_id: string | null;
  voided_by: 'user' | 'webhook';
}> {
  static type = 'invoice.voided' as const;
}

export class InvoiceDeleted extends BaseEvent<{
  invoice_id: string;
  organization_id: string;
  deleted_by: 'user' | 'webhook';
}> {
  static type = 'invoice.deleted' as const;
}
