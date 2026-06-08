import type { ServiceContext } from '@/shared/types/service-context';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
// oxlint-disable-next-line import/no-namespace
import type * as schema from '@/schema';

export type FundDestination = 'operating' | 'trust';

export interface FundRoutingInvoice {
  id: string;
  fund_destination: string;
  matter_id: string | null;
  invoice_number: string | null;
  invoice_type: string;
}

export interface TransferInstruction {
  destination: string;
  metadata: {
    invoice_id: string;
    invoice_number: string | null;
    invoice_type: string;
    fund_destination: FundDestination;
    matter_id: string;
  };
  holdForApproval: boolean;
  escrowStatus: 'none' | 'held';
  updateRetainerBalance: boolean;
}

export interface RecordRetainerDepositOpts {
  organizationId: string;
  clientId: string;
  matterId: string;
  amount: number;
  description?: string;
  source?: string;
  invoiceId?: string;
  ctx: ServiceContext;
  tx: NodePgDatabase<typeof schema>;
}

// oxlint-disable-next-line typescript/no-empty-interface
export interface RecordRetainerWithdrawalOpts extends RecordRetainerDepositOpts {}

export interface RevertRetainerOpts {
  organizationId: string;
  clientId: string;
  matterId: string;
  amount: number;
  description?: string;
  ctx: ServiceContext;
  tx: NodePgDatabase<typeof schema>;
}

export interface RefundEventPayload {
  invoice_id: string;
  organization_id: string;
  refund_request_id: string;
  refunded_amount: number;
  payout_fee_credit_cents: number;
  credit_invoice_fee: boolean;
}

export interface RecordDepositOpts {
  organizationId: string;
  clientId: string;
  matterId: string;
  amount: number;
  invoiceId?: string;
}

export interface RecordWithdrawalOpts {
  organizationId: string;
  clientId: string;
  matterId: string;
  amount: number;
  reason: string;
}
