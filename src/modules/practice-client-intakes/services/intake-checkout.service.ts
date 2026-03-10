import { eq, sql } from 'drizzle-orm';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { isAccountActive } from '@/modules/onboarding/services/connected-accounts.service';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import {
  practiceClientIntakesSchema,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { getActorAccessibleIntake } from '@/modules/practice-client-intakes/services/intake-access.helpers';
import {
  formatIntakeStatusResponse,
  logger,
  parseMetadata,
  resolvePracticeClientIntakeByCheckoutSessionId,
} from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import { createIntakeCheckoutSession } from '@/modules/practice-client-intakes/services/intake-stripe.helpers';
import type {
  ClaimPracticeClientIntakeResponse,
  CreateCheckoutSessionResponse,
  IntakePostPayStatusResponse,
  IntakeStatusResponse,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { userDetailsService } from '@/modules/user-details/services/user-details.service';
import { db } from '@/shared/database';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const { practiceClientIntakes } = practiceClientIntakesSchema;

type ClaimIntakeAbort = {
  __claimIntakeResult: true;
  result: Result<ClaimPracticeClientIntakeResponse>;
};

const isClaimIntakeAbort = (value: unknown): value is ClaimIntakeAbort => {
  return Boolean(
    value
    && typeof value === 'object'
    && '__claimIntakeResult' in value
    && 'result' in value,
  );
};

const buildUpdatedMetadata = (ctx: ServiceContext, practiceClientIntake: { metadata: unknown }) => {
  const baseMetadata = parseMetadata(practiceClientIntake.metadata);
  if (ctx.userId) {
    return {
      ...(baseMetadata ?? { email: '', name: '' }),
      user_id: baseMetadata?.user_id ?? ctx.userId,
    };
  }
  return baseMetadata ?? undefined;
};

const processClaimIntakeTx = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  intake: NonNullable<Extract<Awaited<ReturnType<typeof resolvePracticeClientIntakeByCheckoutSessionId>>, { success: true }>['data']['intake']>,
  userId: string,
) => {
  const rollbackWithResult = (resultValue: Result<ClaimPracticeClientIntakeResponse>): never => {
    throw {
      __claimIntakeResult: true,
      result: resultValue,
    } satisfies ClaimIntakeAbort;
  };

  await tx.execute(sql`
    SELECT 1
    FROM "practice_client_intakes"
    WHERE "id" = ${intake.id}
    FOR UPDATE
  `);

  const [lockedIntake] = await tx
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.id, intake.id))
    .limit(1);

  if (!lockedIntake) {
    return rollbackWithResult(result.notFound('Practice client intake not found'));
  }

  if (lockedIntake.status !== 'succeeded') {
    return rollbackWithResult(result.badRequest('Payment must be completed before claiming intake'));
  }

  const intakeMetadata = parseMetadata(lockedIntake.metadata);
  if (!intakeMetadata) {
    return rollbackWithResult(result.badRequest('Intake metadata is invalid or malformed'));
  }
  if (!intakeMetadata.email || !intakeMetadata.name) {
    return rollbackWithResult(result.badRequest('Intake metadata is missing required email or name'));
  }

  if (intakeMetadata.user_id && intakeMetadata.user_id !== userId) {
    return rollbackWithResult(result.forbidden('This intake has already been claimed by another user'));
  }

  const userDetailsResult = await userDetailsService.createUserDetailsFromIntake({
    organizationId: lockedIntake.organization_id,
    intakeId: lockedIntake.id,
    userId: userId,
    email: intakeMetadata.email,
    name: intakeMetadata.name,
    phone: intakeMetadata.phone,
  });

  if (!userDetailsResult.success) {
    return rollbackWithResult(
      result.fail(userDetailsResult.error.message, userDetailsResult.error.status, userDetailsResult.error.code),
    );
  }

  if (!intakeMetadata.user_id) {
    await tx
      .update(practiceClientIntakes)
      .set({
        metadata: {
          ...intakeMetadata,
          email: intakeMetadata.email as string,
          name: intakeMetadata.name as string,
          user_id: userId,
        },
        updated_at: new Date(),
      })
      .where(eq(practiceClientIntakes.id, intake.id));
  }

  return result.ok({
    success: true,
    data: {
      intake_uuid: lockedIntake.id,
      organization_id: lockedIntake.organization_id,
    },
  });
};

const createCheckoutSession = async (
  params: { uuid: string; origin?: string | null },
  ctx: ServiceContext,
): Promise<Result<CreateCheckoutSessionResponse>> => {
  try {
    const intakeResult = await getActorAccessibleIntake(params.uuid, ctx, 'update');
    if (!intakeResult.success) {
      return intakeResult;
    }

    const practiceClientIntake = intakeResult.data;
    if (practiceClientIntake.status !== 'open') {
      return result.badRequest('Intake is not eligible for checkout session creation');
    }

    const organization = await organizationRepository.findById(practiceClientIntake.organization_id);
    if (!organization) {
      return result.notFound('Organization not found');
    }

    const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);
    if (!connectedAccount) {
      return result.fail('Connected account not found');
    }

    if (!(await isAccountActive(connectedAccount))) {
      return result.forbidden('Connected account is not ready to accept payments');
    }

    if (practiceClientIntake.stripe_checkout_session_id) {
      try {
        const resolveResult = await resolvePracticeClientIntakeByCheckoutSessionId(
          practiceClientIntake.stripe_checkout_session_id,
          { requireSession: true },
        );

        const existingSession = resolveResult.success ? resolveResult.data.session : undefined;

        const isReusable = existingSession
          && existingSession.status === 'open'
          && existingSession.payment_status !== 'paid';

        if (isReusable && existingSession.url) {
          return result.ok({
            success: true,
            data: {
              url: existingSession.url,
              session_id: existingSession.id,
            },
          });
        }
      } catch (error) {
        logger.error('Failed to retrieve checkout session for intake {uuid}: {error}', {
          uuid: practiceClientIntake.id,
          error,
        });
      }
    }

    const metadata = parseMetadata(practiceClientIntake.metadata) ?? { email: '', name: '' };

    const session = await createIntakeCheckoutSession({
      currency: practiceClientIntake.currency,
      amount: practiceClientIntake.amount,
      email: metadata.email,
      name: metadata.name,
      phone: metadata.phone,
      on_behalf_of: metadata.on_behalf_of,
      opposing_party: metadata.opposing_party,
      description: metadata.description,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      intakeId: practiceClientIntake.id,
      stripeAccountId: connectedAccount.stripe_account_id,
      origin: params.origin,
      conversationId: practiceClientIntake.conversation_id,
      userId: ctx.userId,
    });

    if (!session.url) {
      return result.internalError('Stripe Checkout Session URL missing');
    }

    const updatedMetadata = buildUpdatedMetadata(ctx, practiceClientIntake);

    await practiceClientIntakesRepository.update(practiceClientIntake.id, {
      stripe_checkout_session_id: session.id,
      metadata: updatedMetadata,
    });

    return result.ok({
      success: true,
      data: {
        url: session.url,
        session_id: session.id,
      },
    });
  } catch (error) {
    logger.error('Failed to create checkout session for intake {uuid}: {error}', {
      uuid: params.uuid,
      error,
    });
    return result.internalError('Failed to create checkout session');
  }
};

const getIntakeStatus = async (
  params: { uuid: string },
  ctx: ServiceContext,
): Promise<Result<IntakeStatusResponse>> => {
  try {
    const intakeResult = await getActorAccessibleIntake(params.uuid, ctx, 'read');
    if (!intakeResult.success) {
      return intakeResult;
    }

    return result.ok({
      success: true,
      data: formatIntakeStatusResponse(intakeResult.data, {
        requestingUserId: ctx.userId,
        isAdmin: Boolean(ctx.memberRole),
      }),
    });
  } catch (error) {
    logger.error('Failed to get practice client intake status for {uuid}: {error}', {
      uuid: params.uuid,
      error,
    });
    return result.internalError('Failed to get practice client intake status');
  }
};

const getPostPayStatus = async (
  params: { sessionId: string },
): Promise<Result<IntakePostPayStatusResponse>> => {
  try {
    const resolveResult = await resolvePracticeClientIntakeByCheckoutSessionId(params.sessionId);
    if (!resolveResult.success) {
      return resolveResult;
    }
    const { intake } = resolveResult.data;
    if (!intake) {
      return result.notFound('Checkout session not found');
    }

    if (intake.status !== 'succeeded') {
      return result.ok({
        success: true,
        data: {
          paid: false,
        },
      });
    }

    return result.ok({
      success: true,
      data: {
        paid: true,
        intake_uuid: intake.id,
        organization_id: intake.organization_id,
      },
    });
  } catch (error) {
    logger.error('Failed to get post-pay status for session {sessionId}: {error}', {
      sessionId: params.sessionId,
      error,
    });
    return result.internalError('Failed to get post-pay status');
  }
};

const claimIntake = async (
  params: { sessionId: string },
  ctx: ServiceContext,
): Promise<Result<ClaimPracticeClientIntakeResponse>> => {
  try {
    const resolveResult = await resolvePracticeClientIntakeByCheckoutSessionId(params.sessionId);
    if (!resolveResult.success) {
      return resolveResult;
    }
    const { intake } = resolveResult.data;
    if (!intake) {
      return result.notFound('Checkout session not found');
    }

    return await db.transaction((tx) => processClaimIntakeTx(tx, intake, ctx.userId));
  } catch (error) {
    if (isClaimIntakeAbort(error)) {
      return error.result;
    }

    logger.error('Failed to claim intake for session {sessionId}: {error}', {
      sessionId: params.sessionId,
      error,
    });
    return result.internalError('Failed to claim intake');
  }
};

export const intakeCheckoutService = {
  createCheckoutSession,
  getIntakeStatus,
  getPostPayStatus,
  claimIntake,
};
