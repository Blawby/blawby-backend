import { getLogger } from '@logtape/logtape';
import { onboardingRepository as onboardingRepo } from '@/modules/onboarding/database/queries/onboarding.repository';
import type { StripeConnectedAccount, NewStripeConnectedAccount } from '@/modules/onboarding/schemas/onboarding.schema';
import type {
  CreateAccountResponse,
  GetAccountResponse,
  CreateSessionResponse,
} from '@/modules/onboarding/types/onboarding.types';
import { stripeAccountNormalizers } from '@/modules/onboarding/utils/stripeAccountNormalizers';
import { StripeConnectedAccountCreated } from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import { ok, notFound, internalError } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['onboarding', 'connected-accounts']);

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

  if (disabledReason) {return 'disabled';}
  if (pendingVerification.length > 0) {return 'verification_pending';}
  if (missingRequirements.length > 0) {return 'requirements_due';}
  if (!isActive) {return 'inactive';}
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
  const {requirements} = account;
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
  async createStripeAccount(
    organizationId: string,
    email: string,
    userId?: string
  ): Promise<Result<StripeConnectedAccount>> {
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

      return ok(createdAccount);
    } catch (error) {
      logger.error('Failed to create Stripe account for organization {organizationId}: {error}', {
        error,
        userId,
        organizationId,
      });
      return internalError(error instanceof Error ? error.message : 'Failed to create Stripe account');
    }
  },

  /**
   * Create account link for hosted onboarding
   */
  async createAccountLinkForAccount(
    account: StripeConnectedAccount,
    refreshUrl: string,
    returnUrl: string
  ): Promise<Result<CreateSessionResponse>> {
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
      logger.error('Failed to create Stripe account link for organization {organizationId}: {error}', {
        error,
        organizationId: account.organization_id,
      });
      return internalError(error instanceof Error ? error.message : 'Failed to create Stripe account link');
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
  ): Promise<Result<CreateAccountResponse>> {
    // Check if account exists
    let account = await connectedAccountsService.findAccountByOrganization(organizationId);

    if (!account) {
      // Create new account
      const result = await connectedAccountsService.createStripeAccount(organizationId, email, userId);
      if (!result.success) {return result;}
      account = result.data;
    }

    // Create account link for the account
    const linkResult = await connectedAccountsService.createAccountLinkForAccount(account, refreshUrl, returnUrl);
    if (!linkResult.success) {return linkResult;}

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
  },

  /**
   * Create embedded payments session
   */
  async createPaymentsSession(stripeAccountId: string): Promise<Result<CreateSessionResponse>> {
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
      logger.error('Failed to create Stripe payments session for {stripeAccountId}: {error}', {
        error,
        stripeAccountId,
      });
      return internalError(error instanceof Error ? error.message : 'Failed to create Stripe payments session');
    }
  },

  /**
   * Get account status and requirements
   */
  async getAccount(organizationId: string): Promise<Result<GetAccountResponse | null>> {
    try {
      const account = await onboardingRepo.findByOrganizationId(organizationId);

      if (!account) {
        return ok(null);
      }

      const readiness = getAccountReadiness({ account });

      return ok({
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
      });
    } catch (error) {
      logger.error('Failed to retrieve connected account status for {organizationId}: {error}', {
        organizationId,
        error,
      });
      return internalError('Failed to retrieve connected account status');
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
  async createPaymentsSessionForOrganization(organizationId: string): Promise<Result<CreateSessionResponse>> {
    const result = await connectedAccountsService.getAccount(organizationId);
    if (!result.success) {return result;}

    const account = result.data;

    if (!account) {
      return notFound('No Stripe account found for organization');
    }

    return connectedAccountsService.createPaymentsSession(account.account_id);
  },
};

export default connectedAccountsService;

// Legacy exports
export const {findAccountByOrganization} = connectedAccountsService;
export const {createStripeAccount} = connectedAccountsService;
export const {createAccountLinkForAccount} = connectedAccountsService;
export const {createOrGetAccount} = connectedAccountsService;
export const {createPaymentsSession} = connectedAccountsService;
export const {getAccount} = connectedAccountsService;
export const {isAccountActive} = connectedAccountsService;
export const {createPaymentsSessionForOrganization} = connectedAccountsService;
