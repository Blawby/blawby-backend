import {
  findByOrganization,
  createStripeConnectedAccount,
} from '@/modules/onboarding/repositories/onboarding.repository';
import type {
  StripeConnectedAccount,
  NewStripeConnectedAccount,
  CreateAccountResponse,
  GetAccountResponse,
  CreateSessionResponse,
  CompanyInfo,
  IndividualInfo,
  Requirements,
  Capabilities,
  ExternalAccounts,
} from '@/modules/onboarding/schemas/onboarding.schema';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { stripe } from '@/shared/utils/stripe-client';

// 1. Find existing account (single responsibility)
export const findAccountByOrganization = async (
  organizationId: string,
): Promise<StripeConnectedAccount | null> => {
  return await findByOrganization(organizationId);
};

// 2. Create new Stripe account (single responsibility)
export const createStripeAccount = async (
  organizationId: string,
  email: string,
): Promise<StripeConnectedAccount> => {
  const stripeAccount = await stripe.accounts.create({
    country: 'US',
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
      us_bank_account_ach_payments: { requested: true },
    },
    controller: {
      fees: { payer: 'application' },
      stripe_dashboard: { type: 'none' },
    },
  });

  // Save to database
  const newAccount: NewStripeConnectedAccount = {
    organization_id: organizationId,
    stripe_account_id: stripeAccount.id,
    account_type: 'custom',
    country: 'US',
    email,
    charges_enabled: stripeAccount.charges_enabled,
    payouts_enabled: stripeAccount.payouts_enabled,
    details_submitted: stripeAccount.details_submitted,
    business_type: stripeAccount.business_type,
    company: stripeAccount.company as CompanyInfo | undefined,
    individual: stripeAccount.individual as IndividualInfo | undefined,
    requirements: stripeAccount.requirements as Requirements | undefined,
    capabilities: stripeAccount.capabilities as Capabilities | undefined,
    externalAccounts: stripeAccount.external_accounts as ExternalAccounts | undefined,
    metadata: stripeAccount.metadata as Record<string, string> | undefined,
    last_refreshed_at: new Date(),
  };

  void publishSimpleEvent(
    EventType.STRIPE_CONNECTED_ACCOUNT_CREATED,
    'system',
    organizationId,
    {
      account_id: stripeAccount.id,
      email,
      country: 'US',
    },
  );

  return await createStripeConnectedAccount(newAccount);
};

// 3. Create onboarding session for existing account (single responsibility)
export const createOnboardingSessionForAccount = async (
  account: StripeConnectedAccount,
): Promise<CreateSessionResponse> => {
  // Create session with Stripe (no database storage needed)
  const session = await stripe.accountSessions.create({
    account: account.stripe_account_id,
    components: {
      account_onboarding: {
        enabled: true,
      },
    },
  });

  return {
    client_secret: session.client_secret,
    expires_at: session.expires_at,
  };
};

// 4. Main orchestrator function (coordinates other functions)
export const createOrGetAccount = async (
  organizationId: string,
  email: string,
): Promise<CreateAccountResponse> => {
  // Check if account exists
  let account = await findAccountByOrganization(organizationId);

  if (!account) {
    // Create new account
    account = await createStripeAccount(organizationId, email);
  }

  // Create onboarding session for the account
  const session = await createOnboardingSessionForAccount(account);

  return {
    account_id: account.stripe_account_id,
    client_secret: session.client_secret,
    expires_at: session.expires_at,
    session_status: 'created',
    status: {
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    },
  };
};

export const createOnboardingSession = async (
  email: string,
  organizationId: string,
): Promise<CreateSessionResponse> => {
  // Get existing account (don't create new one here)
  const account = await findAccountByOrganization(organizationId);

  if (!account) {
    throw new Error('No Stripe account found for organization. Create account first.');
  }

  // Use the single-purpose session creation function
  return await createOnboardingSessionForAccount(account);
};

export const createPaymentsSession = async (
  stripeAccountId: string,
): Promise<CreateSessionResponse> => {
  // Create session with Stripe (no database storage needed)
  const session = await stripe.accountSessions.create({
    account: stripeAccountId,
    components: {
      payments: {
        enabled: true,
        features: {
          refund_management: true,
          dispute_management: true,
          capture_payments: true,
        },
      },
    },
  });

  return {
    client_secret: session.client_secret,
    expires_at: session.expires_at,
  };
};

export const getAccount = async (
  organizationId: string,
): Promise<GetAccountResponse | null> => {
  const account = await findByOrganization(organizationId);

  if (!account) {
    return null;
  }

  const isActive = isAccountActive(account);

  return {
    accountId: account.stripe_account_id,
    status: {
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      is_active: isActive,
    },
    requirements: account.requirements,
    onboarding_completed_at: account.onboarding_completed_at?.toISOString() || null,
  };
};

export const isAccountActive = (account: StripeConnectedAccount): boolean => {
  // Check if charges and payouts are enabled
  if (!account.charges_enabled || !account.payouts_enabled) {
    return false;
  }

  // Check if requirements are met
  if (account.requirements) {
    const { currently_due, eventually_due, past_due } = account.requirements;
    if (
      currently_due.length > 0
      || eventually_due.length > 0
      || past_due.length > 0
    ) {
      return false;
    }
  }

  return true;
};

/**
 * Create payments session for organization
 */
export const createPaymentsSessionForOrganization = async (
  organizationId: string,
): Promise<CreateSessionResponse> => {
  const account = await getAccount(organizationId);

  if (!account) {
    throw new Error('No Stripe account found for organization');
  }

  return createPaymentsSession(account.accountId);
};
