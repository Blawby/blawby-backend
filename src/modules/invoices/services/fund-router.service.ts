import type { SelectInvoice } from '@/modules/invoices/database/schema/invoices.schema';
import type { Result } from '@/shared/types/result';
import { ok, badRequest } from '@/shared/utils/result';

export type FundDestination = 'operating' | 'trust';

const VALID_FUND_DESTINATIONS: readonly FundDestination[] = ['operating', 'trust'] as const;

/**
 * Type guard that validates a fund destination value at runtime.
 * Prevents silent misrouting of funds from invalid DB values.
 */
const isValidFundDestination = (value: unknown): value is FundDestination =>
  typeof value === 'string' && VALID_FUND_DESTINATIONS.includes(value as FundDestination);

const validateFundDestination = (value: unknown, invoiceId: string): Result<FundDestination> => {
  if (isValidFundDestination(value)) {
    return ok(value);
  }
  return badRequest(
    `Invalid fund_destination '${String(value)}' on invoice ${invoiceId}. Expected one of: ${VALID_FUND_DESTINATIONS.join(', ')}`,
    'INVALID_FUND_DESTINATION'
  );
};

/**
 * Transfer instruction returned by fund routing logic
 */
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
  /** Amount to keep as platform application fee (in cents) */
  applicationFeeAmount: number;
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
/**
 * Application fees are not deducted from transfers in the current model.
 * Fees are billed via metered usage after payment settlement.
 *
 * @param amount - Amount in cents
 * @returns Always 0
 */
const calculateApplicationFee = (amount: number): number => {
  void amount;
  return 0;
};

/**
 * Routes payment based on invoice type and returns transfer instructions
 *
 * @param invoice - The invoice that was paid
 * @param connectedAccountId - Practice's Stripe connected account ID
 * @returns Result with transfer instruction or failure
 */
const routePayment = (invoice: SelectInvoice, connectedAccountId: string): Result<TransferInstruction> => {
  const destinationResult = validateFundDestination(invoice.fund_destination, invoice.id);
  if (!destinationResult.success) {
    return destinationResult;
  }

  if (!invoice.matter_id) {
    return badRequest(
      `Missing matter_id on invoice ${invoice.id}. Fund routing requires a matter association.`,
      'MISSING_MATTER_ID'
    );
  }

  const applicationFeeAmount = calculateApplicationFee(invoice.total);

  const baseMetadata = {
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number ?? null,
    invoice_type: invoice.invoice_type,
    fund_destination: destinationResult.data,
    matter_id: invoice.matter_id,
  };

  switch (invoice.invoice_type) {
    case 'flat_fee':
    case 'phase_fee':
      // Earned upon receipt — transfer immediately to operating
      return ok({
        destination: connectedAccountId,
        metadata: {
          ...baseMetadata,
          fund_destination: 'operating',
        },
        holdForApproval: false,
        escrowStatus: 'none',
        updateRetainerBalance: false,
        applicationFeeAmount,
      });

    case 'retainer_deposit':
      // Client money — transfer to Practice trust account
      // Platform does NOT manage trust accounting; Practice does
      return ok({
        destination: connectedAccountId,
        metadata: {
          ...baseMetadata,
          fund_destination: 'trust',
        },
        holdForApproval: false,
        // EscrowStatus stays 'none' on Platform side because
        // Platform is NOT managing trust — Practice is.
        // The metadata flag tells Practice this is a trust deposit.
        escrowStatus: 'none',
        updateRetainerBalance: true,
        applicationFeeAmount,
      });

    default:
      return badRequest(`Unknown invoice type: ${invoice.invoice_type}`, 'UNKNOWN_INVOICE_TYPE');
  }
};

/**
 * Determines if funds should be held for approval
 * (Currently always false - no escrow for legal billing)
 *
 * @returns Whether to hold funds
 */
const shouldHoldForApproval = (): boolean => false;

/**
 * Determines if retainer balance should be updated
 *
 * @param invoice - The invoice
 * @returns Whether to update retainer balance
 */
const shouldUpdateRetainerBalance = (invoice: SelectInvoice): boolean => invoice.invoice_type === 'retainer_deposit';

/**
 * Fund Router Service
 *
 * Determines transfer behavior based on invoice type.
 * This is the critical decision point for legal billing compliance.
 */
export const fundRouterService = {
  isValidFundDestination,
  validateFundDestination,
  calculateApplicationFee,
  routePayment,
  shouldHoldForApproval,
  shouldUpdateRetainerBalance,
};
