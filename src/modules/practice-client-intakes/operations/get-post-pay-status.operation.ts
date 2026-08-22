import { HTTPException } from 'hono/http-exception';

import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type { IntakePostPayStatusResponse } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

/** Explicit marker for the existing public Blawby route, which has no caller-scoped organization to assert against. */
export interface PublicPostPayStatusCaller {
  scope: 'public';
}

export type PostPayStatusCaller = LegalOperationContext | PublicPostPayStatusCaller;

/**
 * Looks up post-pay status by the Stripe Checkout Session id. `caller` must be either a
 * tenant-scoped `LegalOperationContext` or the explicit `{ scope: 'public' }` marker used by the
 * existing public route — the tenant assertion can never be skipped by simply omitting an
 * argument (KTD19).
 */
export const getPostPayStatus = async (
  params: { sessionId: string },
  caller: PostPayStatusCaller
): Promise<IntakePostPayStatusResponse> => {
  const { intake } = await intakeSharedHelpers.resolvePracticeClientIntakeByCheckoutSessionId(params.sessionId);
  if (!intake) {
    throw new HTTPException(404, { message: 'Checkout session not found' });
  }

  if (!('scope' in caller)) {
    assertLegalOperationTenant(caller, intake.organization_id);
  }

  if (intake.status !== 'succeeded') {
    return {
      paid: false,
    };
  }

  return {
    paid: true,
    intake_uuid: intake.id,
    organization_id: intake.organization_id,
  };
};
