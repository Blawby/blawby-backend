import type { SelectInvoice } from '@/modules/invoices/database/schema/invoices.schema';

/**
 * Transfer instruction returned by fund routing logic
 */
export interface TransferInstruction {
  /** Stripe connected account ID to transfer to */
  destination: string;
  /** Metadata to include in Stripe transfer */
  metadata: {
    invoice_id: string;
    invoice_number: string;
    invoice_type: string;
    fund_destination: 'operating' | 'trust';
    matter_id: string;
  };
  /** Whether to hold funds for client approval (escrow) */
  holdForApproval: boolean;
  /** Escrow status for invoice */
  escrowStatus: 'none' | 'held';
  /** Whether to update matter retainer balance */
  updateRetainerBalance: boolean;
}

/**
 * Fund Router Service
 *
 * Determines transfer behavior based on invoice type.
 * This is the critical decision point for legal billing compliance.
 *
 * Key Rules (per Issue #74):
 * - flat_fee: Earned upon receipt → operating (immediate)
 * - phase_fee: Earned upon receipt per phase → operating (immediate)
 * - retainer_deposit: Client funds → trust (lawyer routes internally)
 * - milestone_escrow (OPTIONAL): Held until approval → escrow
 */
export class FundRouterService {
  /**
   * Routes payment based on invoice type and returns transfer instructions
   *
   * @param invoice - The invoice that was paid
   * @param connectedAccountId - Practice's Stripe connected account ID
   * @returns Transfer instruction with routing metadata
   */
  async routePayment(
    invoice: SelectInvoice,
    connectedAccountId: string,
  ): Promise<TransferInstruction> {
    const baseMetadata = {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_type: invoice.invoice_type,
      fund_destination: invoice.fund_destination as 'operating' | 'trust',
      matter_id: invoice.matter_id || '',
    };

    switch (invoice.invoice_type) {
      case 'flat_fee':
      case 'phase_fee':
        // Earned upon receipt — transfer immediately to operating
        return {
          destination: connectedAccountId,
          metadata: {
            ...baseMetadata,
            fund_destination: 'operating',
          },
          holdForApproval: false,
          escrowStatus: 'none',
          updateRetainerBalance: false,
        };

      case 'retainer_deposit':
        // Client money — transfer to Practice trust account
        // Platform does NOT manage trust accounting; Practice does
        return {
          destination: connectedAccountId,
          metadata: {
            ...baseMetadata,
            fund_destination: 'trust',
          },
          holdForApproval: false,
          // escrowStatus stays 'none' on Platform side because
          // Platform is NOT managing trust — Practice is.
          // The metadata flag tells Practice this is a trust deposit.
          escrowStatus: 'none',
          updateRetainerBalance: true,
        };

      default:
        throw new Error(`Unknown invoice type: ${invoice.invoice_type}`);
    }
  }

  /**
   * Determines if funds should be held for approval
   * (Currently always false - no escrow for legal billing)
   *
   * @returns Whether to hold funds
   */
  shouldHoldForApproval(): boolean {
    // Legal billing doesn't use escrow by default
    // Flat fees and retainer deposits transfer immediately
    return false;
  }

  /**
   * Determines if retainer balance should be updated
   *
   * @param invoice - The invoice
   * @returns Whether to update retainer balance
   */
  shouldUpdateRetainerBalance(invoice: SelectInvoice): boolean {
    return invoice.invoice_type === 'retainer_deposit';
  }
}

/**
 * Singleton instance
 */
export const fundRouterService = new FundRouterService();
