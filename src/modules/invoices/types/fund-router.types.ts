export type FundDestination = 'operating' | 'trust';

export interface FundRoutingInvoice {
  id: string;
  fund_destination: string;
  matter_id: string | null;
  invoice_number: string | null;
  invoice_type: string;
}

export interface TransferInstruction {
  /** Stripe connected account ID to transfer to */
  destination: string;
  /** Metadata to include in Stripe transfer */
  metadata: {
    invoice_id: string;
    invoice_number: string | null;
    invoice_type: string;
    fund_destination: FundDestination;
    matter_id: string;
  };
  /** Whether to hold funds for client approval (escrow) */
  holdForApproval: boolean;
  /** Escrow status for invoice */
  escrowStatus: 'none' | 'held';
  /** Whether to update matter retainer balance */
  updateRetainerBalance: boolean;
}
