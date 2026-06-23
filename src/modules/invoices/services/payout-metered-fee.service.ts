import { PLATFORM_VARIABLE_FEE_RATE } from '@/modules/invoices/constants';
import { stripe } from '@/shared/utils/stripe-client';
import type { Stripe } from 'stripe';

interface CalculateMeteredFeeParams {
  amountPaid: number;
  chargeId: string | null;
  stripeAccountId: string | null;
}

interface CalculateMeteredFeeDependencies {
  retrieveCharge: (
    chargeId: string,
    stripeAccountId: string | null
  ) => Promise<Pick<Stripe.Charge, 'balance_transaction'>>;
}

const retrieveCharge = async (chargeId: string, stripeAccountId: string | null): Promise<Stripe.Charge> =>
  await stripe.charges.retrieve(
    chargeId,
    { expand: ['balance_transaction'] },
    stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
  );

const calculateMeteredFeeCents = async (
  { amountPaid, chargeId, stripeAccountId }: CalculateMeteredFeeParams,
  dependencies: CalculateMeteredFeeDependencies = { retrieveCharge }
): Promise<number> => {
  const variablePlatformFee = Math.round(amountPaid * PLATFORM_VARIABLE_FEE_RATE);
  if (!chargeId) {
    return variablePlatformFee;
  }

  const charge = await dependencies.retrieveCharge(chargeId, stripeAccountId);
  const stripeFee = typeof charge.balance_transaction === 'string' ? 0 : (charge.balance_transaction?.fee ?? 0);
  return stripeFee + variablePlatformFee;
};

export const payoutMeteredFeeService = { calculateMeteredFeeCents } as const;
