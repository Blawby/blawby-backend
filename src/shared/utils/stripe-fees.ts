import { getStripeInstance } from '@/shared/utils/stripe-client';

const APPLICATION_FEE_MULTIPLIER = 1.3336;

/**
 * Resolves the actual Stripe processing fee from a charge's balance transaction.
 * Returns the fee in cents, or null if unable to resolve.
 */
export const resolveBalanceTransactionFee = async (
  chargeId: string,
): Promise<number | null> => {
  const stripe = getStripeInstance();
  const charge = await stripe.charges.retrieve(chargeId, {
    expand: ['balance_transaction'],
  });

  const balanceTransaction = charge.balance_transaction;
  if (!balanceTransaction || typeof balanceTransaction === 'string') {
    return null;
  }

  return balanceTransaction.fee;
};

/**
 * Calculates the platform application fee based on the actual Stripe processing fee.
 * Applies a 1.3336x markup on the Stripe fee (matching Laravel implementation).
 */
export const calculateActualApplicationFee = (stripeFee: number): number => {
  if (stripeFee <= 0) return 0;
  return Math.round(stripeFee * APPLICATION_FEE_MULTIPLIER);
};
