import { getLogger } from '@logtape/logtape';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { HTTPException } from 'hono/http-exception';
import { onboardingRepository as onboardingRepo } from '@/modules/onboarding/database/queries/onboarding.repository';
import type { StripeConnectedAccount, NewStripeConnectedAccount } from '@/modules/onboarding/schemas/onboarding.schema';
import type {
  CreateAccountResponse,
  GetAccountResponse,
  CreateSessionResponse,
} from '@/modules/onboarding/types/onboarding.types';
import { stripeAccountNormalizers } from '@/modules/onboarding/utils/stripeAccountNormalizers';
import { StripeConnectedAccountCreated } from '@/shared/events/definitions';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['onboarding', 'connected-accounts']);

const isStripeClientError = (
  error: unknown
): error is Error & {
  statusCode?: number;
  type?: string;
} =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { statusCode?: unknown }).statusCode === 'number' &&
  (error as { statusCode: number }).statusCode >= 400 &&
  (error as { statusCode: number }).statusCode < 500;

const rethrowConnectedAccountError = (error: unknown, fallbackMessage: string): never => {
  if (isStripeClientError(error)) {
    throw new HTTPException(error.statusCode as ContentfulStatusCode, {
      message: error instanceof Error ? error.message : fallbackMessage,
      cause: error,
    });
  }

  throw new Error(error instanceof Error ? error.message : fallbackMessage, { cause: error });
};

const isMissingConnectedAccountError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const rawMessage = error instanceof Error ? error.message : (error as { message?: unknown }).message;
  const message = typeof rawMessage === 'string' ? rawMessage : '';
  return (
    isStripeClientError(error) &&
    (message.includes('not connected to your platform') ||
      message.includes('does not exist') ||
      message.includes('No such account'))
  );
};

const toConnectedAccountData = (
  organizationId: string,
  email: string,
  stripeAccount: Awaited<ReturnType<typeof stripe.accounts.create>>
): NewStripeConnectedAccount => ({
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
});

const createStripeConnectedAccount = async (email: string) =>
  await stripe.accounts.create({
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

/**
 * Helper to determine readiness status based on requirements and capabilities
 */
const deriveReadinessStatus = (params: {
  disabledReason: string | null;
  pendingVerification: string[];
  missingRequirements: string[];
  isActive: boolean;
}): 'active' | 'requirements_due' | 'verification_pending' | 'disabled' | 'inactive' => {
  const { disabledReason, pendingVerification, missingRequirements, isActive } = params;

  if (disabledReason) {
    return 'disabled';
  }
  if (pendingVerification.length > 0) {
    return 'verification_pending';
  }
  if (missingRequirements.length > 0) {
    return 'requirements_due';
  }
  if (!isActive) {
    return 'inactive';
  }
  return 'active';
};

/**
 * Get account readiness status details
 */
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
  const { requirements } = account;
  const currentDue = requirements?.currently_due ?? [];
  const pastDue = requirements?.past_due ?? [];
  const pendingVerification = requirements?.pending_verification ?? [];
  const disabledReason = requirements?.disabled_reason ?? null;
  const currentDeadline = requirements?.current_deadline ?? null;

  const capabilities = account.capabilities ?? {};
  const hasCardPayments = capabilities['card_payments'] === 'active';
  const hasTransfers = capabilities['transfers'] === 'active';

  const missingRequirements = [...currentDue, ...pastDue];
  const isBaseEnabled = account.charges_enabled && account.payouts_enabled;

  const isActive =
    isBaseEnabled &&
    hasCardPayments &&
    hasTransfers &&
    missingRequirements.length === 0 &&
    !disabledReason &&
    pendingVerification.length === 0;

  const readinessStatus = deriveReadinessStatus({
    disabledReason,
    pendingVerification,
    missingRequirements,
    isActive,
  });

  return {
    isActive,
    readinessStatus,
    missingRequirements,
    disabledReason,
    currentDeadline,
  };
};

/**
 * Connected Accounts Service
 *
 * Handles Stripe Connected Account management and session creation
 */
export const connectedAccountsService = {
  /**
   * Find existing account for an organization
   */
  async findAccountByOrganization(organizationId: string): Promise<StripeConnectedAccount | null> {
    return onboardingRepo.findByOrganizationId(organizationId);
  },

  /**
   * Create new Stripe connected account
   */
  async createStripeAccount(organizationId: string, email: string, userId?: string): Promise<StripeConnectedAccount> {
    try {
      const stripeAccount = await createStripeConnectedAccount(email);

      // Save to database
      const createdAccount = await onboardingRepo.create(toConnectedAccountData(organizationId, email, stripeAccount));

      void StripeConnectedAccountCreated.dispatch(
        {
          account_id: stripeAccount.id,
          email,
          country: 'US',
        },
        {
          actorId: userId ?? 'system',
          organizationId,
        }
      );

      return createdAccount;
    } catch (error) {
      logger.error('Failed to create Stripe account for organization {organizationId}: {error}', {
        error,
        userId,
        organizationId,
      });
      return rethrowConnectedAccountError(error, 'Failed to create Stripe account');
    }
  },

  /**
   * Replace a stale local connected account with a new Stripe account while preserving the local row id.
   */
  async replaceStripeAccount(account: StripeConnectedAccount, userId?: string): Promise<StripeConnectedAccount> {
    try {
      const oldStripeAccountId = account.stripe_account_id;
      const stripeAccount = await createStripeConnectedAccount(account.email);
      const updatedAccount = await onboardingRepo.update(
        account.id,
        toConnectedAccountData(account.organization_id, account.email, stripeAccount)
      );

      if (!updatedAccount) {
        throw new HTTPException(404, { message: 'Connected account not found' });
      }

      logger.warn(
        'Replaced stale Stripe connected account {oldStripeAccountId} with {newStripeAccountId} for organization {organizationId}',
        {
          oldStripeAccountId,
          newStripeAccountId: stripeAccount.id,
          organizationId: account.organization_id,
        }
      );

      void StripeConnectedAccountCreated.dispatch(
        {
          account_id: stripeAccount.id,
          email: account.email,
          country: 'US',
        },
        {
          actorId: userId ?? 'system',
          organizationId: account.organization_id,
        }
      );

      return updatedAccount;
    } catch (error) {
      logger.error('Failed to replace Stripe account for organization {organizationId}: {error}', {
        error,
        userId,
        organizationId: account.organization_id,
      });
      return rethrowConnectedAccountError(error, 'Failed to replace Stripe account');
    }
  },

  /**
   * Create account link for hosted onboarding
   */
  async createAccountLinkForAccount(
    account: StripeConnectedAccount,
    refreshUrl: string,
    returnUrl: string
  ): Promise<CreateSessionResponse> {
    try {
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
    } catch (error) {
      logger.error('Failed to create Stripe account link for organization {organizationId}: {error}', {
        error,
        organizationId: account.organization_id,
      });
      return rethrowConnectedAccountError(error, 'Failed to create Stripe account link');
    }
  },

  /**
   * Orchestrator: Create or get account and return session URL
   */
  async createOrGetAccount(
    organizationId: string,
    email: string,
    refreshUrl: string,
    returnUrl: string,
    userId?: string
  ): Promise<CreateAccountResponse> {
    // Check if account exists
    let account = await connectedAccountsService.findAccountByOrganization(organizationId);

    if (!account) {
      // Create new account — throws on failure
      account = await connectedAccountsService.createStripeAccount(organizationId, email, userId);
    }

    let accountLink: CreateSessionResponse;
    try {
      accountLink = await connectedAccountsService.createAccountLinkForAccount(account, refreshUrl, returnUrl);
    } catch (error) {
      if (!isMissingConnectedAccountError(error)) {
        throw error;
      }

      account = await connectedAccountsService.replaceStripeAccount(account, userId);
      accountLink = await connectedAccountsService.createAccountLinkForAccount(account, refreshUrl, returnUrl);
    }

    return {
      account_id: account.stripe_account_id,
      url: accountLink.url ?? '',
      expires_at: accountLink.expires_at,

      session_status: 'created',
      status: {
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      },
    };
  },

  /**
   * Create embedded payments session
   */
  async createPaymentsSession(stripeAccountId: string): Promise<CreateSessionResponse> {
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

      return {
        client_secret: session.client_secret,
        expires_at: session.expires_at,
      };
    } catch (error) {
      logger.error('Failed to create Stripe payments session for {stripeAccountId}: {error}', {
        error,
        stripeAccountId,
      });
      return rethrowConnectedAccountError(error, 'Failed to create Stripe payments session');
    }
  },

  /**
   * Get account status and requirements
   * Returns null if no account exists (not an error condition).
   */
  async getAccount(organizationId: string): Promise<GetAccountResponse | null> {
    try {
      const account = await onboardingRepo.findByOrganizationId(organizationId);

      if (!account) {
        return null;
      }

      const readiness = getAccountReadiness({ account });

      return {
        account_id: account.stripe_account_id,
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
        onboarding_completed_at: account.onboarding_completed_at ?? null,
      };
    } catch (error) {
      logger.error('Failed to retrieve connected account status for {organizationId}: {error}', {
        organizationId,
        error,
      });
      return rethrowConnectedAccountError(error, 'Failed to retrieve connected account status');
    }
  },

  /**
   * Check if an account is fully active
   */
  async isAccountActive(account: StripeConnectedAccount): Promise<boolean> {
    return getAccountReadiness({ account }).isActive;
  },

  /**
   * Create payments session for organization
   */
  async createPaymentsSessionForOrganization(organizationId: string): Promise<CreateSessionResponse> {
    const account = await connectedAccountsService.getAccount(organizationId);

    if (!account) {
      throw new HTTPException(404, { message: 'No Stripe account found for organization' });
    }

    return connectedAccountsService.createPaymentsSession(account.account_id);
  },
};

export default connectedAccountsService;
