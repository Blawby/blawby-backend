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
} from '@/modules/onboarding/schemas/onboarding.schema';
import { stripeAccountNormalizers } from '@/modules/onboarding/utils/stripeAccountNormalizers';
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
  userId?: string,
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
    company: stripeAccountNormalizers.normalizeCompany(stripeAccount.company),
    individual: stripeAccountNormalizers.normalizeIndividual(stripeAccount.individual),
    requirements: stripeAccountNormalizers.normalizeRequirements(stripeAccount.requirements),
    capabilities: stripeAccountNormalizers.normalizeCapabilities(stripeAccount.capabilities),
    externalAccounts: stripeAccountNormalizers.normalizeExternalAccounts(stripeAccount.external_accounts),
    futureRequirements: stripeAccountNormalizers.normalizeFutureRequirements(stripeAccount.future_requirements),
    tosAcceptance: stripeAccountNormalizers.normalizeTosAcceptance(stripeAccount.tos_acceptance),
    metadata: stripeAccount.metadata ?? undefined,
    last_refreshed_at: new Date(),
  };

  void publishSimpleEvent(
    EventType.STRIPE_CONNECTED_ACCOUNT_CREATED,
    userId ?? 'system',
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
// 3. Create account link for hosted onboarding
export const createAccountLinkForAccount = async (
  account: StripeConnectedAccount,
  refreshUrl: string,
  returnUrl: string,
): Promise<CreateSessionResponse> => {
  // Create account link for hosted onboarding
  const accountLink = await stripe.accountLinks.create({
    account: account.stripe_account_id,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return {
    url: accountLink.url,
    expires_at: accountLink.expires_at,
  };
};

// 4. Main orchestrator function (coordinates other functions)
export const createOrGetAccount = async (
  organizationId: string,
  email: string,
  refreshUrl: string,
  returnUrl: string,
  userId?: string,
): Promise<CreateAccountResponse> => {
  // Check if account exists
  let account = await findAccountByOrganization(organizationId);

  if (!account) {
    // Create new account
    account = await createStripeAccount(organizationId, email, userId);
  }

  // Create account link for the account
  const accountLink = await createAccountLinkForAccount(account, refreshUrl, returnUrl);

  return {
    account_id: account.stripe_account_id,
    url: accountLink.url!,
    expires_at: accountLink.expires_at,

    session_status: 'created',
    status: {
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    },
  };
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

  const readiness = getAccountReadiness({ account });

  return {
    accountId: account.stripe_account_id,
    status: {
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      is_active: readiness.isActive,
      readiness_status: readiness.readinessStatus,
      missing_requirements: readiness.missingRequirements,
      disabled_reason: readiness.disabledReason,
      current_deadline: readiness.currentDeadline,
    },
    requirements: account.requirements,
    future_requirements: account.futureRequirements,
    onboarding_completed_at: account.onboarding_completed_at?.toISOString() || null,
  };
};

const getAccountReadiness = function getAccountReadiness(input: {
  account: StripeConnectedAccount;
}): {
  isActive: boolean;
  readinessStatus: 'active' | 'requirements_due' | 'verification_pending' | 'disabled' | 'inactive';
  missingRequirements: string[];
  disabledReason: string | null;
  currentDeadline: number | null;
} {
  const { account } = input;
  const requirements = account.requirements;
  const currentDue = requirements?.currently_due ?? [];
  const pastDue = requirements?.past_due ?? [];
  const pendingVerification = requirements?.pending_verification ?? [];
  const disabledReason = requirements?.disabled_reason ?? null;
  const currentDeadline = requirements?.current_deadline ?? null;
  const capabilities = account.capabilities || {};
  const hasCardPayments = capabilities.card_payments === 'active';
  const hasTransfers = capabilities.transfers === 'active';
  const missingRequirements = [...currentDue, ...pastDue];
  const isBaseEnabled = account.charges_enabled && account.payouts_enabled;
  const isActive = isBaseEnabled
    && hasCardPayments
    && hasTransfers
    && missingRequirements.length === 0
    && !disabledReason
    && pendingVerification.length === 0;
  if (disabledReason) {
    return {
      isActive: false,
      readinessStatus: 'disabled',
      missingRequirements,
      disabledReason,
      currentDeadline,
    };
  }
  if (pendingVerification.length > 0) {
    return {
      isActive: false,
      readinessStatus: 'verification_pending',
      missingRequirements,
      disabledReason,
      currentDeadline,
    };
  }
  if (missingRequirements.length > 0) {
    return {
      isActive: false,
      readinessStatus: 'requirements_due',
      missingRequirements,
      disabledReason,
      currentDeadline,
    };
  }
  if (!isActive) {
    return {
      isActive: false,
      readinessStatus: 'inactive',
      missingRequirements,
      disabledReason,
      currentDeadline,
    };
  }
  return {
    isActive: true,
    readinessStatus: 'active',
    missingRequirements,
    disabledReason,
    currentDeadline,
  };
};

export const isAccountActive = (account: StripeConnectedAccount): boolean => {
  return getAccountReadiness({ account }).isActive;
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
