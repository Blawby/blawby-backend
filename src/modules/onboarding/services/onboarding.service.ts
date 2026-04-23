import { getLogger } from '@logtape/logtape';
import { ForbiddenError } from '@casl/ability';
import { onboardingRepository as onboardingRepo } from '@/modules/onboarding/database/queries/onboarding.repository';
import { connectedAccountsService } from '@/modules/onboarding/services/connected-accounts.service';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import type { OnboardingStatusResponse } from '@/modules/onboarding/types/onboarding.types';
import { OnboardingStarted } from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { ok, notFound, internalError } from '@/shared/utils/result';

const logger = getLogger(['onboarding', 'service']);
const assertOnboardingAccess = (ctx: ServiceContext): void => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('manage', 'Onboarding');
};

/**
 * Onboarding Service
 */
const onboardingService = {
  /**
   * Create onboarding session for organization
   */
  async createOnboardingSession(
    params: {
      organizationEmail: string;
      organizationId: string;
      refreshUrl: string;
      returnUrl: string;
    },
    ctx: ServiceContext
  ): Promise<Result<OnboardingStatusResponse>> {
    const { organizationEmail, organizationId, refreshUrl, returnUrl } = params;
    const { user } = ctx;

    assertOnboardingAccess(ctx);

    try {
      const organization = await organizationRepository.findById(organizationId);
      if (!organization) {
        return notFound(`Organization not found for ${organizationId}`);
      }

      const result = await connectedAccountsService.createOrGetAccount(
        organizationId,
        organizationEmail,
        refreshUrl,
        returnUrl,
        user.id
      );

      if (!result.success) {
        return result;
      }
      const accountData = result.data;
      const connectedAccount = await onboardingRepo.findByStripeAccountId(accountData.account_id);
      if (!connectedAccount) {
        return internalError('Connected account was created but could not be loaded');
      }

      // Publish onboarding started event
      await ctx.emit(OnboardingStarted, {
        organization_id: organizationId,
        organization_email: organizationEmail,
        account_id: accountData.account_id,
        session_id: accountData.url,
      });

      return ok({
        url: accountData.url,
        practice_uuid: organizationId,
        connected_account_id: connectedAccount.id,
        stripe_account_id: accountData.account_id,
        charges_enabled: accountData.status.charges_enabled,
        payouts_enabled: accountData.status.payouts_enabled,
        details_submitted: accountData.status.details_submitted,
      });
    } catch (error) {
      logger.error('Failed to create onboarding session for organization {organizationId}: {error}', {
        organizationId,
        userId: user.id,
        error,
      });

      return internalError(error instanceof Error ? error.message : 'Failed to create onboarding session');
    }
  },

  /**
   * Get onboarding status for organization
   */
  async getOnboardingStatus(
    { organizationId }: { organizationId: string },
    ctx: ServiceContext
  ): Promise<Result<OnboardingStatusResponse>> {
    assertOnboardingAccess(ctx);

    try {
      const organization = await organizationRepository.findById(organizationId);
      if (!organization) {
        return notFound(`Organization not found for ${organizationId}`);
      }

      // 2. Fetch the connected account
      const account = await onboardingRepo.findByOrganizationId(organizationId);

      if (!account) {
        // Return default "not started" status instead of 404
        // This is a valid business state, not an error
        return ok({
          practice_uuid: organizationId,
          connected_account_id: null,
          stripe_account_id: null,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
        });
      }

      return ok({
        practice_uuid: organizationId,
        connected_account_id: account.id,
        stripe_account_id: account.stripe_account_id,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      });
    } catch (error) {
      logger.error('Failed to get onboarding status for organization {organizationId}: {error}', {
        organizationId,
        userId: ctx.user.id,
        error,
      });

      return internalError('Failed to get onboarding status');
    }
  },

  /**
   * Create connected account for organization
   */
  async createConnectedAccount(
    params: {
      email: string;
      organizationId: string;
      refreshUrl: string;
      returnUrl: string;
    },
    ctx: ServiceContext
  ): Promise<Result<OnboardingStatusResponse>> {
    const { email, organizationId, refreshUrl, returnUrl } = params;
    const { user } = ctx;

    assertOnboardingAccess(ctx);

    try {
      const organization = await organizationRepository.findById(organizationId);
      if (!organization) {
        return notFound(`Organization not found for ${organizationId}`);
      }

      const result = await connectedAccountsService.createOrGetAccount(
        organizationId,
        email,
        refreshUrl,
        returnUrl,
        user.id
      );

      if (!result.success) {
        return result;
      }
      const accountData = result.data;
      const connectedAccount = await onboardingRepo.findByStripeAccountId(accountData.account_id);
      if (!connectedAccount) {
        return internalError('Connected account was created but could not be loaded');
      }

      return ok({
        practice_uuid: organizationId,
        connected_account_id: connectedAccount.id,
        url: accountData.url,
        stripe_account_id: accountData.account_id,
        charges_enabled: accountData.status.charges_enabled,
        payouts_enabled: accountData.status.payouts_enabled,
        details_submitted: accountData.status.details_submitted,
      });
    } catch (error) {
      logger.error('Failed to create connected account for organization {organizationId}: {error}', {
        organizationId,
        userId: user.id,
        error,
      });

      return internalError(error instanceof Error ? error.message : 'Failed to create connected account');
    }
  },
};

export { onboardingService };
