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

/**
 * Create onboarding session for organization
 */
export const createOnboardingSession = async (params: {
  organizationEmail: string;
  organizationId: string;
  user: User;
  requestHeaders: Record<string, string>;
}): Promise<StripeConnectedAccountBase> => {
  const {
    organizationEmail, organizationId, user,
  } = params;

  try {
    const result = await createOrGetAccount(organizationId, organizationEmail);

    // Publish onboarding started event
    void publishUserEvent(EventType.ONBOARDING_STARTED, user.id, {
      organization_id: organizationId,
      organization_email: organizationEmail,
      account_id: result.account_id,
      session_id: result.client_secret,
    });

    return {
      client_secret: result.client_secret ?? undefined,
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
  requestHeaders: Record<string, string>;
}): Promise<StripeConnectedAccountBase> => {
  const {
    email, organizationId, user,
  } = params;

  try {
    const result = await createOrGetAccount(organizationId, email);

    return {
      practice_uuid: organizationId,
      client_secret: result.client_secret ?? undefined,
      stripe_account_id: result.account_id,
      charges_enabled: result.status.charges_enabled,
      payouts_enabled: result.status.payouts_enabled,
      details_submitted: result.status.details_submitted,
    };
  } catch (error) {
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
