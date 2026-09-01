import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { IntakePostPayStatusResponse } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { uow } from '@/shared/database/uow';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['practice-client-intakes', 'verify-post-pay-consistency-operation']);

interface VerifyPostPayConsistencyParams {
  organizationId: string;
  intakeUuid: string;
  sessionId: string;
  requestKey: string;
}

/**
 * A single stable rejection message for every correlation mismatch (wrong organization, wrong
 * intake UUID, wrong request reference, or a Stripe session that resolves to a different intake)
 * — R10 requires post-pay to disclose no resource-existence detail across any of these boundaries,
 * so none of them may produce a distinguishable message.
 */
const CONSISTENCY_FAILURE_MESSAGE = 'Post-pay verification failed';
const SESSION_CONFLICT_MESSAGE = 'Checkout session does not match the recorded session for this intake';

const resolveSessionIntakeUuid = (session: {
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
}): string | undefined => {
  if (typeof session.metadata?.intake_uuid === 'string') {
    return session.metadata.intake_uuid;
  }
  if (typeof session.client_reference_id === 'string') {
    return session.client_reference_id;
  }
  return undefined;
};

const resolveSessionPaymentLinkId = (session: {
  payment_link?: string | { id: string } | null;
}): string | undefined => {
  if (!session.payment_link) {
    return undefined;
  }
  return typeof session.payment_link === 'string' ? session.payment_link : session.payment_link.id;
};

/**
 * Non-mutating correlation check (R10): organization, path intake UUID, Stripe Checkout Session,
 * and the trusted KrabiClaw request reference must all describe the same intake before any
 * session reference is attached. Every rejection path — wrong organization, wrong UUID, wrong
 * reference, or a session that resolves to a different intake — performs zero writes (verified
 * before any read that could mutate). Once all four correlations agree, the session id is
 * attached with null-to-value or same-value conditional semantics: a still-unset intake gets the
 * session id via a compare-and-set write, an intake that already carries this exact session id is
 * a no-op, and an intake that already carries a *different* session id is rejected — so two
 * concurrent callers racing to attach different session ids for the same intake have exactly one
 * winner (KTD19, R10).
 */
const verifyPostPayConsistency = async (
  params: VerifyPostPayConsistencyParams,
  ctx: LegalOperationContext
): Promise<IntakePostPayStatusResponse> => {
  const { organizationId, intakeUuid, sessionId, requestKey } = params;
  assertLegalOperationTenant(ctx, organizationId);

  const intake = await practiceClientIntakesRepository.findById(intakeUuid);
  if (!intake || intake.organization_id !== organizationId) {
    throw new HTTPException(404, { message: CONSISTENCY_FAILURE_MESSAGE });
  }

  if (!intake.krabiclaw_request_key || intake.krabiclaw_request_key !== requestKey) {
    throw new HTTPException(404, { message: CONSISTENCY_FAILURE_MESSAGE });
  }

  const session = await (async (): Promise<Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>> => {
    try {
      return await stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      logger.warn('Could not retrieve Stripe checkout session for post-pay verification', {
        error_name: error instanceof Error ? error.name : 'unknown',
      });
      throw new HTTPException(404, { message: CONSISTENCY_FAILURE_MESSAGE });
    }
  })();

  const sessionIntakeUuid = resolveSessionIntakeUuid(session);
  const sessionPaymentLinkId = resolveSessionPaymentLinkId(session);
  const sessionResolvesToIntake =
    sessionIntakeUuid === intakeUuid ||
    (sessionIntakeUuid === undefined &&
      sessionPaymentLinkId !== undefined &&
      sessionPaymentLinkId === intake.stripe_payment_link_id);

  if (!sessionResolvesToIntake) {
    throw new HTTPException(404, { message: CONSISTENCY_FAILURE_MESSAGE });
  }

  if (intake.stripe_checkout_session_id && intake.stripe_checkout_session_id !== sessionId) {
    throw new HTTPException(409, { message: SESSION_CONFLICT_MESSAGE });
  }

  if (!intake.stripe_checkout_session_id) {
    const attached = await uow.transaction(() =>
      practiceClientIntakesRepository.attachCheckoutSessionIfAbsent(intake.id, sessionId)
    );

    if (!attached) {
      // Lost the compare-and-set race to a concurrent attach — find out who won.
      const refreshed = await practiceClientIntakesRepository.findById(intake.id);
      if (refreshed?.stripe_checkout_session_id !== sessionId) {
        throw new HTTPException(409, { message: SESSION_CONFLICT_MESSAGE });
      }
    }
  }

  if (intake.status !== 'succeeded') {
    return { paid: false };
  }

  return {
    paid: true,
    intake_uuid: intake.id,
    organization_id: intake.organization_id,
  };
};

export { verifyPostPayConsistency, type VerifyPostPayConsistencyParams };
