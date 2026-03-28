import { getLogger } from '@logtape/logtape';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['clients', 'stripe-service']);

const findCustomerByMetadata = async (
  metadata: Record<string, string>,
  ctx: ServiceContext
): Promise<Result<string | undefined>> => {
  try {
    const query = Object.entries(metadata)
      .map(([k, v]) => `metadata['${k}']:'${v}'`)
      .join(' AND ');
    const response = await stripe.customers.search({
      query,
      limit: 1,
    });

    return result.ok(response.data[0]?.id);
  } catch (error) {
    logger.error('Failed to search Stripe customer by metadata {metadata}: {error}', {
      metadata,
      error,
      organizationId: ctx.organizationId,
    });
    return result.fail('Failed to search Stripe customer', 500, 'STRIPE_SEARCH_FAILED');
  }
};

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

export const clientsStripeService = {
  findCustomerByMetadata,
  createCustomer,
  updateCustomer,
};
