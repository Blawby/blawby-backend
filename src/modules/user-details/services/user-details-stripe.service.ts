import { getLogger } from '@logtape/logtape';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import type { ServiceContext } from '@/shared/types/service-context';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['user-details', 'stripe-service']);

const createCustomer = async (
  params: {
    email: string;
    name: string;
    phone?: string;
    metadata?: Record<string, string>;
  },
  ctx: ServiceContext
): Promise<string | undefined> => {
  const connectedAccount = await onboardingRepository.findByOrganizationId(ctx.organizationId);
  if (!connectedAccount?.stripe_account_id) {
    return undefined;
  }

  try {
    // Customer is created on the PLATFORM account (no stripeAccount header).
    // Invoices use the on_behalf_of model — platform collects payment, then
    // Immediately transfers to the connected account with fund routing metadata.
    // Trust accounting is the lawyer's responsibility per LEGAL_BILLING_FUND_ROUTING_PLAN.md
    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name,
      phone: params.phone,
      metadata: {
        ...params.metadata,
        connected_account_id: connectedAccount.stripe_account_id,
      },
    });
    return customer.id;
  } catch (error) {
    logger.error('Failed to create Stripe customer for {email}: {error}', {
      email: params.email,
      error,
      organizationId: ctx.organizationId,
    });
    return undefined;
  }
};

const updateCustomer = async (
  params: {
    customerId: string;
    email?: string;
    name?: string;
    phone?: string;
  },
  ctx: ServiceContext
): Promise<void> => {
  const connectedAccount = await onboardingRepository.findByOrganizationId(ctx.organizationId);
  if (!connectedAccount?.stripe_account_id) {
    return;
  }

  try {
    await stripe.customers.update(params.customerId, {
      email: params.email,
      name: params.name,
      phone: params.phone,
    });
  } catch (error) {
    logger.error('Failed to update Stripe customer {customerId}: {error}', {
      customerId: params.customerId,
      error,
      organizationId: ctx.organizationId,
    });
  }
};

export const userDetailsStripeService = {
  createCustomer,
  updateCustomer,
};
