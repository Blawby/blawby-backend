import { getLogger } from '@logtape/logtape';

import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { intakeCheckoutService } from '@/modules/practice-client-intakes/services/intake-checkout.service';
import { resolvePracticeClientIntakeByCheckoutSessionId } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import {
  executeClaimPracticeClientIntakeTx,
  isClaimIntakeAbort,
} from '@/modules/practice-client-intakes/services/intake-transactions.helpers';
import type { ClaimPracticeClientIntakeResponse } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { appConfigService } from '@/shared/services/app-config.service';
import type { PrefillData } from '@/shared/types/prefill';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { getMatchingFrontendUrl } from '@/shared/utils/env';
import { result } from '@/shared/utils/result';

const logger = getLogger(['practice-client-intakes', 'service', 'lifecycle']);

/**
 * Claim a paid intake and link to authenticated user
 */
const claimPracticeClientIntakePayment = async (
  params: { session_id: string; user_id: string },
  _ctx: ServiceContext,
): Promise<Result<ClaimPracticeClientIntakeResponse>> => {
  const { session_id, user_id } = params;
  try {
    const { intake } = await resolvePracticeClientIntakeByCheckoutSessionId(session_id);

    if (!intake) {
      return result.notFound('Checkout session not found');
    }

    const transactionResult = await db.transaction(async (tx) => {
      return await executeClaimPracticeClientIntakeTx(tx, {
        intakeId: intake.id,
        userId: user_id,
      });
    });

    return transactionResult;
  } catch (error) {
    if (isClaimIntakeAbort(error)) {
      return error.result;
    }
    logger.error('Failed to claim intake for session {sessionId}: {error}', {
      sessionId: session_id,
      error,
    });
    return result.internalError('Failed to claim intake');
  }
};

/**
 * Trigger a magic link for the user associated with an intake.
 * When the user clicks the magic link and authenticates, the onLinkAccount
 * hook will add them to the organization as a client.
 */
const triggerIntakeInvitation = async (
  params: { uuid: string; sessionUserId: string; origin?: string | null },
  ctx: ServiceContext,
): Promise<Result<{ success: true; message: string }>> => {
  const { uuid, sessionUserId, origin } = params;
  try {
    const intakeResult = await intakeCheckoutService.getPracticeClientIntakeStatus(
      { uuid, requestingUserId: sessionUserId },
      ctx,
    );

    if (!intakeResult.success || !intakeResult.data?.data) {
      return intakeResult as Result<never>;
    }

    const intakeData = intakeResult.data.data;
    const metadata = intakeData.metadata;

    if (metadata?.user_id !== sessionUserId) {
      return result.forbidden('You do not own this intake');
    }

    if (!metadata?.email) {
      return result.badRequest('No email address found in intake data');
    }

    const organization = await organizationRepository.findById(intakeData.organization_id);
    if (!organization) {
      return result.notFound('Organization not found');
    }

    const prefillData: PrefillData = {
      type: 'intake',
      intakeId: uuid,
      conversationId: intakeData.conversation_id ?? '',
      email: metadata.email,
      orgName: organization.name,
      orgSlug: organization.slug,
    };

    const encodedData = Buffer.from(JSON.stringify(prefillData)).toString('base64url');
    const auth = createBetterAuthInstance(db);

    const intakeRedirectUrl = await appConfigService.get<string>('intake_redirect_url');
    const redirectPath = intakeRedirectUrl || 'auth/accept-invitation';
    const separator = redirectPath.includes('?') ? '&' : '?';

    await auth.api.signInMagicLink({
      headers: new Headers(origin ? { origin } : undefined),
      body: {
        email: metadata.email,
        callbackURL: `${getMatchingFrontendUrl(origin)}/${redirectPath}${separator}data=${encodedData}`,
      },
    });

    return result.ok({ success: true, message: 'Magic link sent to your email' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to send magic link for intake {uuid}: {error} {details}', {
      uuid,
      error: errorMessage,
      details: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });
    return result.internalError('An unexpected error occurred while sending the magic link');
  }
};

export const intakeLifecycleService = {
  claimPracticeClientIntakePayment,
  triggerIntakeInvitation,
};
