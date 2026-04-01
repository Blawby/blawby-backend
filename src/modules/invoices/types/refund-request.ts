import type { InsertRefundRequest } from '@/modules/invoices/database/schema/refund-requests.schema.ts';
import type { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository.ts';

export type RefundRequestUpdatePatch = Partial<
  Omit<
    InsertRefundRequest,
    | 'id'
    | 'organization_id'
    | 'client_user_details_id'
    | 'created_by_user_details_id'
    | 'invoice_id'
    | 'requested_amount'
    | 'currency'
    | 'created_at'
  >
>;

export type InvoiceRecord = NonNullable<Awaited<ReturnType<typeof invoicesRepository.findInvoiceById>>>;

export interface RefundEventPayload {
  invoice_id: string;
  organization_id: string;
  refund_request_id: string;
  refunded_amount: number;
  payout_fee_credit_cents: number;
  credit_invoice_fee: boolean;
}
