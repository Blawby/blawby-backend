import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { onboardingRepository as onboardingRepo } from '@/modules/onboarding/database/queries/onboarding.repository';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import type { OnboardingStatusResponse } from '@/modules/onboarding/types/onboarding.types';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

const logger = getLogger(['onboarding', 'get-connect-status-operation']);

/**
 * Get onboarding status for organization
 */
export const getConnectStatus = async (
  { organizationId }: { organizationId: string },
  ctx: LegalOperationContext
): Promise<OnboardingStatusResponse> => {
  assertLegalOperationTenant(ctx, organizationId);

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) {
    throw new HTTPException(404, { message: `Organization not found for ${organizationId}` });
  }

  try {
    // Fetch the connected account
    const account = await onboardingRepo.findByOrganizationId(organizationId);

    if (!account) {
      // Return default "not started" status instead of 404
      // This is a valid business state, not an error
      return {
        practice_uuid: organizationId,
        connected_account_id: null,
        stripe_account_id: null,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      };
    }

    return {
      practice_uuid: organizationId,
      connected_account_id: account.id,
      stripe_account_id: account.stripe_account_id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    };
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to get onboarding status for organization {organizationId}: {error}', {
      organizationId,
      userId: ctx.userId,
      error,
    });

    throw new Error('Failed to get onboarding status', { cause: error });
  }
};
