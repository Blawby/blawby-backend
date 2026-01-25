import { getLogger } from '@logtape/logtape';
import {
  onboardingRepository as onboardingRepo,
} from '@/modules/onboarding/database/queries/onboarding.repository';
import {
  connectedAccountsService,
} from '@/modules/onboarding/services/connected-accounts.service';
import type {
  OnboardingStatusResponse,
} from '@/modules/onboarding/types/onboarding.types';
import { organizationService } from '@/modules/practice/services/organization.service';
import { OnboardingStarted } from '@/shared/events/definitions';
import type { User } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import { ok, notFound, internalError } from '@/shared/utils/result';

const logger = getLogger(['onboarding', 'service']);

/**
 * Onboarding Service
 */
export const onboardingService = {
  /**
   * Create onboarding session for organization
   */
  async createOnboardingSession(params: {
    organizationEmail: string;
    organizationId: string;
    user: User;
    refreshUrl: string;
    returnUrl: string;
    requestHeaders: Record<string, string>;
  }): Promise<Result<OnboardingStatusResponse>> {
    const {
      organizationEmail, organizationId, user, refreshUrl, returnUrl, requestHeaders,
    } = params;

    try {
      // Validate organization and user access using Better Auth
      const orgResult = await organizationService.getFullOrganization(organizationId, user, requestHeaders);

      if (!orgResult.success) {
        return orgResult;
      }

      const result = await connectedAccountsService.createOrGetAccount(
        organizationId,
        organizationEmail,
        refreshUrl,
        returnUrl,
        user.id,
      );

      if (!result.success) return result;
      const accountData = result.data;

      // Publish onboarding started event
      void OnboardingStarted.dispatch({
        organization_id: organizationId,
        organization_email: organizationEmail,
        account_id: accountData.account_id,
        session_id: accountData.url,
      }, {
        actorId: user.id,
      });

      return ok({
        url: accountData.url,
        practice_uuid: organizationId,
        stripe_account_id: accountData.account_id,
        charges_enabled: accountData.status.charges_enabled,
        payouts_enabled: accountData.status.payouts_enabled,
        details_submitted: accountData.status.details_submitted,
      });
    } catch (error) {
      logger.error(
        'Failed to create onboarding session for organization {organizationId}: {error}',
        {
          organizationId,
          userId: user.id,
          error,
        },
      );

      return internalError(error instanceof Error ? error.message : 'Failed to create onboarding session');
    }
  },

  /**
   * Get onboarding status for organization
   */
  async getOnboardingStatus(
    organizationId: string,
    user: User,
    requestHeaders: Record<string, string>,
  ): Promise<Result<OnboardingStatusResponse>> {
    try {
      // 1. Validate organization and user access using Better Auth
      const orgResult = await organizationService.getFullOrganization(organizationId, user, requestHeaders);

      if (!orgResult.success) {
        return orgResult;
      }

      // 2. Fetch the connected account
      const account = await onboardingRepo.findByOrganizationId(organizationId);

      if (!account) {
        return notFound(`Onboarding status not found for organization ${organizationId}`);
      }

      return ok({
        practice_uuid: organizationId,
        stripe_account_id: account.stripe_account_id,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      });
    } catch (error) {
      logger.error(
        'Failed to get onboarding status for organization {organizationId}: {error}',
        {
          organizationId,
          userId: user.id,
          error,
        },
      );

      return internalError('Failed to get onboarding status');
    }
  },

  /**
   * Create connected account for organization
   */
  async createConnectedAccount(params: {
    email: string;
    organizationId: string;
    user: User;
    refreshUrl: string;
    returnUrl: string;
    requestHeaders: Record<string, string>;
  }): Promise<Result<OnboardingStatusResponse>> {
    const {
      email, organizationId, user, refreshUrl, returnUrl, requestHeaders,
    } = params;

    try {
      // Validate organization and user access using Better Auth
      const orgResult = await organizationService.getFullOrganization(organizationId, user, requestHeaders);

      if (!orgResult.success) {
        return orgResult;
      }

      const result = await connectedAccountsService.createOrGetAccount(
        organizationId,
        email,
        refreshUrl,
        returnUrl,
        user.id,
      );

      if (!result.success) return result;
      const accountData = result.data;

      return ok({
        practice_uuid: organizationId,
        url: accountData.url,
        stripe_account_id: accountData.account_id,
        charges_enabled: accountData.status.charges_enabled,
        payouts_enabled: accountData.status.payouts_enabled,
        details_submitted: accountData.status.details_submitted,
      });
    } catch (error) {
      logger.error(
        'Failed to create connected account for organization {organizationId}: {error}',
        {
          organizationId,
          userId: user.id,
          error,
        },
      );

      return internalError(error instanceof Error ? error.message : 'Failed to create connected account');
    }
  },
};

export default onboardingService;

// Legacy exports
export const createOnboardingSession = onboardingService.createOnboardingSession;
export const getOnboardingStatus = onboardingService.getOnboardingStatus;
export const createConnectedAccount = onboardingService.createConnectedAccount;
