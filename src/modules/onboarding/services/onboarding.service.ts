import { getLogger } from '@logtape/logtape';
import {
  onboardingRepository as onboardingRepo,
} from '@/modules/onboarding/database/queries/onboarding.repository';
import {
  createOrGetAccount,
} from '@/modules/onboarding/services/connected-accounts.service';
import type {
  StripeConnectedAccountBase,
} from '@/modules/onboarding/types/onboarding.types';
import { EventType } from '@/shared/events/enums/event-types';
import { publishUserEvent } from '@/shared/events/event-publisher';
import type { User } from '@/shared/types/BetterAuth';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import { Result, ok, notFound, internalError, forbidden } from '@/shared/types/result';

const logger = getLogger(['onboarding', 'service']);

/**
 * Create onboarding session for organization
 */
export const createOnboardingSession = async (params: {
  organizationEmail: string;
  organizationId: string;
  user: User;
  refreshUrl: string;
  returnUrl: string;
  requestHeaders: Record<string, string>;
}): Promise<Result<StripeConnectedAccountBase>> => {
  const {
    organizationEmail, organizationId, user, refreshUrl, returnUrl, requestHeaders,
  } = params;

  try {
    // Validate organization and user access using Better Auth
    const orgResult = await getFullOrganization(organizationId, user, requestHeaders);

    if (!orgResult.success) {
      return orgResult;
    }
    const organization = orgResult.data;

    const result = await createOrGetAccount(
      organizationId,
      organizationEmail,
      refreshUrl,
      returnUrl,
      user.id,
    );

    if (!result.success) return result;
    const accountData = result.data;

    // Publish onboarding started event
    void publishUserEvent(EventType.ONBOARDING_STARTED, user.id, {
      organization_id: organizationId,
      organization_email: organizationEmail,
      account_id: accountData.account_id,
      session_id: accountData.url,
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
      "Failed to create onboarding session for organization {organizationId}: {error}",
      {
        organizationId,
        userId: user.id,
        error,
      }
    );

    return internalError(error instanceof Error ? error.message : 'Failed to create onboarding session');
  }
};

/**
 * Get onboarding status for organization
 */
export const getOnboardingStatus = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<StripeConnectedAccountBase>> => {
  try {
    // 1. Validate organization and user access using Better Auth
    const orgResult = await getFullOrganization(organizationId, user, requestHeaders);

    if (!orgResult.success) {
      return orgResult;
    }
    const organization = orgResult.data;

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
      "Failed to get onboarding status for organization {organizationId}: {error}",
      {
        organizationId,
        userId: user.id,
        error,
      }
    );

    return internalError('Failed to get onboarding status');
  }
};

/**
 * Create connected account for organization
 */
export const createConnectedAccount = async (params: {
  email: string;
  organizationId: string;
  user: User;
  refreshUrl: string;
  returnUrl: string;
  requestHeaders: Record<string, string>;
}): Promise<Result<StripeConnectedAccountBase>> => {
  const {
    email, organizationId, user, refreshUrl, returnUrl, requestHeaders,
  } = params;

  try {
    // Validate organization and user access using Better Auth
    const orgResult = await getFullOrganization(organizationId, user, requestHeaders);

    if (!orgResult.success) {
      return orgResult;
    }
    const organization = orgResult.data;

    const result = await createOrGetAccount(
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
      "Failed to create connected account for organization {organizationId}: {error}",
      {
        organizationId,
        userId: user.id,
        error,
      }
    );

    return internalError(error instanceof Error ? error.message : 'Failed to create connected account');
  }
};
