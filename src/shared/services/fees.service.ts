/**
 * Fees Service
 *
 * Simple fee calculation utilities
 */

export interface FeeConfig {
  stripeFeePercentage: number;
  stripeFeeFixed: number;
  platformFeePercentage: number;
  platformFeeFixed: number;
}

/**
 * Calculate fees for a payment amount
 */
export const calculateFees = function calculateFees(
  amount: number,
  paymentMethodType: string = 'card',
  _country: string = 'US'
): number {
  // Simple fee calculation - 2.9% + $0.30 for card payments
  if (paymentMethodType === 'card') {
    return Math.round(amount * 0.029 + 30);
  }

  // 0.8% for ACH/bank transfers
  if (paymentMethodType === 'ach') {
    return Math.round(amount * 0.008);
  }

  // Default to card fees
  return Math.round(amount * 0.029 + 30);
};

/**
 * Calculate invoice fees
 */
export const calculateInvoiceFees = function calculateInvoiceFees(
  amount: number,
  paymentMethodType: string = 'card',
  country: string = 'US'
): number {
  return calculateFees(amount, paymentMethodType, country);
};

/**
 * Calculate payout fees
 */
export const calculatePayoutFees = function calculatePayoutFees(
  amount: number,
  payoutMethod: string = 'bank',
  country: string = 'US'
): number {
  // Simple payout fee calculation
  if (payoutMethod === 'bank') {
    return 25; // $0.25 for bank transfers
  }

  return 0;
};

/**
 * Get fee configuration for an organization
 */
export const getFeeConfig = function getFeeConfig(_organizationId: string): FeeConfig {
  return {
    stripeFeePercentage: 2.9,
    stripeFeeFixed: 30,
    platformFeePercentage: 0,
    platformFeeFixed: 0,
  };
};
