import { findByOrganization } from '@/modules/onboarding/repositories/onboarding.repository';
import {
  createOrGetAccount,
} from '@/modules/onboarding/services/connected-accounts.service';
import type {
  StripeConnectedAccountBase,
} from '@/modules/onboarding/types/onboarding.types';
import { EventType } from '@/shared/events/enums/event-types';
import { publishUserEvent } from '@/shared/events/event-publisher';
import { logError } from '@/shared/middleware/logger';
import type { User } from '@/shared/types/BetterAuth';
import { getFullOrganization } from '@/modules/practice/services/organization.service';


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
}): Promise<StripeConnectedAccountBase> => {
  const {
    organizationEmail, organizationId, user, refreshUrl, returnUrl, requestHeaders,
  } = params;

  try {
    // Validate organization and user access using Better Auth
    const organization = await getFullOrganization(organizationId, user, requestHeaders);

    if (!organization) {
      throw new Error(`Organization with ID ${organizationId} not found or access denied.`);
    }

    const result = await createOrGetAccount(
      organizationId,
      organizationEmail,
      refreshUrl,
      returnUrl,
    );

    // Publish onboarding started event
    // Note: createOrGetAccount calls Stripe API (external), so we can't use transaction
    // Event is still persisted via event consumer
    void publishUserEvent(EventType.ONBOARDING_STARTED, user.id, {
      organization_id: organizationId,
      organization_email: organizationEmail,
      account_id: result.account_id,
      session_id: result.url,
    });

    return {
      url: result.url,
      practice_uuid: organizationId,
      stripe_account_id: result.account_id,
      charges_enabled: result.status.charges_enabled,
      payouts_enabled: result.status.payouts_enabled,
      details_submitted: result.status.details_submitted,

    };
  } catch (error) {
    logError(error, {
      method: 'POST',
      url: '/api/onboarding/session',
      statusCode: 500,
      userId: user.id,
      organizationId,
      errorType: 'OnboardingServiceError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
};

/**
 * Get onboarding status for organization
 */
export const getOnboardingStatus = async (
  organizationId: string,
  user: User,
  _requestHeaders: Record<string, string>,
): Promise<StripeConnectedAccountBase | null> => {
  try {
    const account = await findByOrganization(organizationId);

    if (!account) {
      return null;
    }

    return {
      practice_uuid: organizationId,
      stripe_account_id: account.stripe_account_id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    };
  } catch (error) {
    console.error('Error in getOnboardingStatus:', error); // Explicit debug log
    logError(error, {
      method: 'GET',
      url: `/api/onboarding/organization/${organizationId}/status`,
      statusCode: 500,
      userId: user.id,
      organizationId,
      errorType: 'OnboardingServiceError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
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
}): Promise<StripeConnectedAccountBase> => {
  const {
    email, organizationId, user, refreshUrl, returnUrl, requestHeaders,
  } = params;

  try {
    // Validate organization and user access using Better Auth
    const organization = await getFullOrganization(organizationId, user, requestHeaders);

    if (!organization) {
      throw new Error(`Organization with ID ${organizationId} not found or access denied.`);
    }

    const result = await createOrGetAccount(
      organizationId,
      email,
      refreshUrl,
      returnUrl,
    );
    console.log('SERVICE: createOrGetAccount returned', result);

    return {
      practice_uuid: organizationId,
      url: result.url,
      stripe_account_id: result.account_id,
      charges_enabled: result.status.charges_enabled,
      payouts_enabled: result.status.payouts_enabled,
      details_submitted: result.status.details_submitted,
    };
  } catch (error) {
    console.error('Error in createConnectedAccount:', error); // Explicit debug log
    logError(error, {
      method: 'POST',
      url: '/api/onboarding/connected-accounts',
      statusCode: 500,
      userId: user.id,
      organizationId,
      errorType: 'OnboardingServiceError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
};
