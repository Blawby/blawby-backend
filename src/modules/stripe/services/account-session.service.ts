import { getLogger } from '@logtape/logtape';

import { connectedAccountsService } from '@/modules/onboarding/services/connected-accounts.service';
import type { AllowedComponent } from '@/modules/stripe/validations/connect.validation';
import type { Result } from '@/shared/types/result';
import { notFound, ok, internalError } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['stripe', 'account-session']);

type ComponentsParam = Parameters<typeof stripe.accountSessions.create>[0]['components'];

interface ComponentEntry {
  enabled: boolean;
  features?: Record<string, boolean>;
}

const COMPONENT_CONFIGS = {
  payments: {
    enabled: true,
    features: {
      refund_management: true,
      dispute_management: true,
      capture_payments: true,
      destination_on_behalf_of_charge_management: true,
    },
  },
  payment_details: { enabled: true, features: {} },
  disputes: { enabled: true, features: {} },
  disputes_list: { enabled: true, features: {} },
  payouts: { enabled: true, features: {} },
  payouts_list: { enabled: true, features: {} },
  payout_details: { enabled: true, features: {} },
  balances: { enabled: true, features: {} },
  reporting_chart: { enabled: true, features: {} },
  documents: { enabled: true, features: {} },
  account_onboarding: { enabled: true, features: {} },
  account_management: { enabled: true, features: {} },
  notification_banner: { enabled: true, features: {} },
  tax_registrations: { enabled: true, features: {} },
  tax_settings: { enabled: true, features: {} },
  tax_exports: { enabled: true, features: {} },
  tax_threshold_monitoring: { enabled: true, features: {} },
} satisfies Record<AllowedComponent, ComponentEntry>;

/**
 * Create a Stripe Account Session for the given organization and requested components.
 */
const createAccountSession = async (
  organizationId: string,
  components: AllowedComponent[]
): Promise<Result<AccountSessionResponse>> => {
  const account = await connectedAccountsService.findAccountByOrganization(organizationId);

  if (!account) {
    return notFound('No connected Stripe account found for this practice');
  }

  const builtComponents = components.reduce< NonNullable<ComponentsParam>>(
    (acc, name) => ({ ...acc, [name]: COMPONENT_CONFIGS[name] }),
    {}
  );

  try {
    const session = await stripe.accountSessions.create({
      account: account.stripe_account_id,
      components: builtComponents,
    });

    return ok({
      client_secret: session.client_secret,
      expires_at: session.expires_at,
      account_id: account.stripe_account_id,
    });
  } catch (error) {
    logger.error('Failed to create Stripe account session for {organizationId}: {error}', {
      error,
      organizationId,
    });
    return internalError('Failed to create Stripe account session');
  }
};

export interface AccountSessionResponse {
  client_secret: string;
  expires_at: number;
  account_id: string;
}

export const accountSessionService = { createAccountSession };
