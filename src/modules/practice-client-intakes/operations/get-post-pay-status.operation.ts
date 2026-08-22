import { HTTPException } from 'hono/http-exception';

import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type { IntakePostPayStatusResponse } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

/**
 * Looks up post-pay status by the Stripe Checkout Session id. The existing Blawby route is
 * public and has no caller-scoped organization to assert until the session resolves to an
 * intake, so `ctx` is optional: omitted for the existing public route (unchanged behavior),
 * and required once a facade caller with a known organization exists (U8).
 */
export const getPostPayStatus = async (
  params: { sessionId: string },
  ctx?: LegalOperationContext
): Promise<IntakePostPayStatusResponse> => {
  const { intake } = await intakeSharedHelpers.resolvePracticeClientIntakeByCheckoutSessionId(params.sessionId);
  if (!intake) {
    throw new HTTPException(404, { message: 'Checkout session not found' });
  }

  if (ctx) {
    assertLegalOperationTenant(ctx, intake.organization_id);
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
