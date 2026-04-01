import { createValidationError } from '@/shared/types/errors';
import type { FundDestination, FundRoutingInvoice, TransferInstruction } from '@/engines/financial/types';

const VALID_FUND_DESTINATIONS: readonly FundDestination[] = ['operating', 'trust'] as const;

/**
 * Type guard: validate fund destination at runtime
 */
const isValidFundDestination = (value: unknown): value is FundDestination =>
  typeof value === 'string' && VALID_FUND_DESTINATIONS.includes(value as FundDestination);

/**
 * Validate fund destination, throw if invalid
 */
const validateFundDestination = (value: unknown, invoiceId: string): FundDestination => {
  if (isValidFundDestination(value)) {
    return value;
  }
  throw createValidationError(
    'INVALID_FUND_DESTINATION',
    `Invalid fund_destination '${String(value)}' on invoice ${invoiceId}. Expected one of: ${VALID_FUND_DESTINATIONS.join(', ')}`,
    { invoiceId, value }
  );
};

/**
 * Calculate application fee (currently always 0, ready for future implementation)
 */
const calculateApplicationFee = (amount: number): number => {
  void amount; // Unused
  return 0;
};

/**
 * Determine if retainer balance should be updated
 */
const shouldUpdateRetainerBalance = (invoice: FundRoutingInvoice): boolean =>
  invoice.invoice_type === 'retainer_deposit';

/**
 * Determine if funds should be held for approval (currently always false)
 */
const shouldHoldForApproval = (): boolean => false;

/**
 * Route payment based on invoice type and return transfer instruction
 */
const routePayment = (invoice: FundRoutingInvoice, connectedAccountId: string): TransferInstruction => {
  const fundDestination = validateFundDestination(invoice.fund_destination, invoice.id);

  if (!invoice.matter_id) {
    throw createValidationError(
      'MISSING_MATTER_ID',
      `Missing matter_id on invoice ${invoice.id}. Fund routing requires a matter association.`,
      { invoiceId: invoice.id }
    );
  }

  const baseMetadata = {
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number ?? null,
    invoice_type: invoice.invoice_type,
    fund_destination: fundDestination,
    matter_id: invoice.matter_id,
  };

  switch (invoice.invoice_type) {
    case 'flat_fee':
    case 'phase_fee':
      // Earned upon receipt — transfer immediately to operating
      return {
        destination: connectedAccountId,
        metadata: {
          ...baseMetadata,
          fund_destination: 'operating' as const,
        },
        holdForApproval: false,
        escrowStatus: 'none' as const,
        updateRetainerBalance: false,
      };

    case 'retainer_deposit':
      // Client money — transfer to Practice trust account
      return {
        destination: connectedAccountId,
        metadata: {
          ...baseMetadata,
          fund_destination: 'trust' as const,
        },
        holdForApproval: false,
        escrowStatus: 'none' as const,
        updateRetainerBalance: true,
      };

    default:
      throw createValidationError('UNKNOWN_INVOICE_TYPE', `Unknown invoice type: ${invoice.invoice_type}`, {
        invoiceType: invoice.invoice_type,
        invoiceId: invoice.id,
      });
  }
};

/**
 * Fund Management Engine
 *
 * Determines where payment goes (operating vs. trust) based on invoice type.
 * Pure domain logic, no DB access. Single object export with all related functions.
 *
 * Usage:
 *   const instruction = fundManagement.routePayment(invoice, connectedAccountId);
 *   const fee = fundManagement.calculateApplicationFee(amount);
 */
export const fundManagement = {
  routePayment,
  isValidFundDestination,
  validateFundDestination,
  calculateApplicationFee,
  shouldUpdateRetainerBalance,
  shouldHoldForApproval,
};
