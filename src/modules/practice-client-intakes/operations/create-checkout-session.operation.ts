import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { connectedAccountsService } from '@/modules/onboarding/services/connected-accounts.service';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import {
  getActorAccessibleIntake,
  type IntakeActorContext,
} from '@/modules/practice-client-intakes/operations/intake-actor-context';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import { createIntakeCheckoutSession } from '@/modules/practice-client-intakes/services/intake-stripe.helpers';
import type { CreateCheckoutSessionResponse } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';

const logger = getLogger(['practice-client-intakes', 'create-checkout-session-operation']);

const buildUpdatedMetadata = (ctx: IntakeActorContext, intake: Pick<SelectPracticeClientIntake, 'metadata'>) => {
  const baseMetadata = intakeSharedHelpers.parseMetadata(intake.metadata);
  if (ctx.userId) {
    return {
      ...(baseMetadata ?? { email: '', name: '' }),
      user_id: baseMetadata?.user_id ?? ctx.userId,
    };
  }
  return baseMetadata ?? undefined;
};

/**
 * Create (or reuse an existing open) Stripe Checkout Session for an intake awaiting payment.
 * Preserves the destination-charge structure and the reuse-if-open guard from the pre-extraction
 * service (R28) — a new session is only created once the previous one is closed or paid.
 */
export const createCheckoutSession = async (
  params: { uuid: string; origin?: string | null },
  ctx: IntakeActorContext
): Promise<CreateCheckoutSessionResponse> => {
  const intake = await getActorAccessibleIntake(params.uuid, ctx);
  if (intake.status !== 'open') {
    throw new HTTPException(400, { message: 'Intake is not eligible for checkout session creation' });
  }

  const organization = await organizationRepository.findById(intake.organization_id);
  if (!organization) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);
  if (!connectedAccount) {
    throw new Error('Connected account not found');
  }

  if (!(await connectedAccountsService.isAccountActive(connectedAccount))) {
    throw new HTTPException(403, { message: 'Connected account is not ready to accept payments' });
  }

  if (intake.stripe_checkout_session_id) {
    try {
      const resolveResult = await intakeSharedHelpers.resolvePracticeClientIntakeByCheckoutSessionId(
        intake.stripe_checkout_session_id,
        { requireSession: true }
      );

      const existingSession = resolveResult.session;
      const isReusable = existingSession?.status === 'open' && existingSession.payment_status !== 'paid';

      if (isReusable && existingSession.url) {
        return {
          url: existingSession.url,
          session_id: existingSession.id,
        };
      }
    } catch (error) {
      logger.error('Failed to retrieve checkout session for intake {uuid}: {error}', {
        uuid: intake.id,
        error,
      });
    }
  }

  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata) ?? { email: '', name: '' };

  const session = await createIntakeCheckoutSession({
    currency: intake.currency,
    amount: intake.amount,
    email: metadata.email,
    name: metadata.name,
    phone: metadata.phone,
    on_behalf_of: metadata.on_behalf_of,
    opposing_party: metadata.opposing_party,
    description: metadata.description,
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    intakeId: intake.id,
    stripeAccountId: connectedAccount.stripe_account_id,
    origin: params.origin,
    conversationId: intake.conversation_id,
    userId: ctx.userId,
  });

  if (!session.url) {
    throw new HTTPException(500, { message: 'Stripe Checkout Session URL missing' });
  }

  const updatedMetadata = buildUpdatedMetadata(ctx, intake);

  await practiceClientIntakesRepository.update(intake.id, {
    stripe_checkout_session_id: session.id,
    metadata: updatedMetadata,
  });

  return {
    url: session.url,
    session_id: session.id,
  };
};
