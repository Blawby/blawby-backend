import { getLogger } from '@logtape/logtape';
import {
  onboardingRepository as onboardingRepo,
} from '@/modules/onboarding/database/queries/onboarding.repository';
import type {
  StripeConnectedAccount,
  NewStripeConnectedAccount,
} from '@/modules/onboarding/schemas/onboarding.schema';
import type {
  CreateAccountResponse,
  GetAccountResponse,
  CreateSessionResponse,
} from '@/modules/onboarding/types/onboarding.types';
import { stripeAccountNormalizers } from '@/modules/onboarding/utils/stripeAccountNormalizers';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { stripe } from '@/shared/utils/stripe-client';
import { Result, ok, notFound, internalError } from '@/shared/types/result';

const logger = getLogger(['onboarding', 'connected-accounts']);

// 1. Find existing account (internal helper - mostly returns data or null)
export const findAccountByOrganization = async (
  organizationId: string,
): Promise<StripeConnectedAccount | null> => {
  return await onboardingRepo.findByOrganizationId(organizationId);
};

// 2. Create new Stripe account (Single responsibility, orchestration)
export const createStripeAccount = async (
  organizationId: string,
  email: string,
  userId?: string,
): Promise<Result<StripeConnectedAccount>> => {
  try {
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

    const createdAccount = await onboardingRepo.create(newAccount);

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

    return ok(createdAccount);
  } catch (error) {
    logger.error("Failed to create Stripe account for organization {organizationId}: {error}", {
      error,
      userId,
      organizationId,
    });
    return internalError(error instanceof Error ? error.message : 'Failed to create Stripe account');
  }
};

// 3. Create account link for hosted onboarding
export const createAccountLinkForAccount = async (
  account: StripeConnectedAccount,
  refreshUrl: string,
  returnUrl: string,
): Promise<Result<CreateSessionResponse>> => {
  try {
    const accountLink = await stripe.accountLinks.create({
      account: account.stripe_account_id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return ok({
      url: accountLink.url,
      expires_at: accountLink.expires_at,
    });
  } catch (error) {
    logger.error("Failed to create Stripe account link for organization {organizationId}: {error}", {
      error,
      organizationId: account.organization_id,
    });
    return internalError(error instanceof Error ? error.message : 'Failed to create Stripe account link');
  }
};

// 4. Main orchestrator function (coordinates other functions)
export const createOrGetAccount = async (
  organizationId: string,
  email: string,
  refreshUrl: string,
  returnUrl: string,
  userId?: string,
): Promise<Result<CreateAccountResponse>> => {
  // Check if account exists
  let account = await findAccountByOrganization(organizationId);

  if (!account) {
    // Create new account
    const result = await createStripeAccount(organizationId, email, userId);
    if (!result.success) return result;
    account = result.data;
  }

  // Create account link for the account
  const linkResult = await createAccountLinkForAccount(account, refreshUrl, returnUrl);
  if (!linkResult.success) return linkResult;

  const accountLink = linkResult.data;

  return ok({
    account_id: account.stripe_account_id,
    url: accountLink.url ?? '',
    expires_at: accountLink.expires_at,

    session_status: 'created',
    status: {
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    },
  });
};

export const createPaymentsSession = async (
  stripeAccountId: string,
): Promise<Result<CreateSessionResponse>> => {
  try {
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

    return ok({
      client_secret: session.client_secret,
      expires_at: session.expires_at,
    });
  } catch (error) {
    logger.error("Failed to create Stripe payments session for {stripeAccountId}: {error}", {
      error,
      stripeAccountId,
    });
    return internalError(error instanceof Error ? error.message : 'Failed to create Stripe payments session');
  }
};

export const getAccount = async (
  organizationId: string,
): Promise<Result<GetAccountResponse | null>> => {
  try {
    const account = await onboardingRepo.findByOrganizationId(organizationId);

    if (!account) {
      return ok(null);
    }

    const readiness = getAccountReadiness({ account });

    return ok({
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
    });
  } catch (error) {
    logger.error("Failed to retrieve connected account status for {organizationId}: {error}", {
      organizationId,
      error,
    });
    return internalError('Failed to retrieve connected account status');
  }
};

const getAccountReadiness = (input: {
  account: StripeConnectedAccount;
}): {
  isActive: boolean;
  readinessStatus: 'active' | 'requirements_due' | 'verification_pending' | 'disabled' | 'inactive';
  missingRequirements: string[];
  disabledReason: string | null;
  currentDeadline: number | null;
} => {
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
): Promise<Result<CreateSessionResponse>> => {
  const result = await getAccount(organizationId);
  if (!result.success) return result;

  const account = result.data;

  if (!account) {
    return notFound('No Stripe account found for organization');
  }

  return createPaymentsSession(account.accountId);
};
