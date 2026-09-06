import { HTTPException } from 'hono/http-exception';

import {
  getActorAccessibleIntake,
  type IntakeActorContext,
} from '@/modules/practice-client-intakes/operations/intake-actor-context';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type { IntakeStatusResponse } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';

/**
 * Backs the facade's `GET /intakes/{uuid}/status` (KTD19): resolves the intake, then authorizes
 * the follow-up by comparing the trusted, caller-supplied `requestReference` against the intake's
 * own `krabiclaw_request_key` — this comparison is this route's actual authorization mechanism,
 * replacing the ownership check the caller (an anonymous-or-human facade actor) cannot satisfy on
 * its own. A mismatch folds to the same 404 `getActorAccessibleIntake` itself would throw for a
 * genuinely missing intake, so the two failures stay indistinguishable to the caller (R14).
 *
 * `isAdmin: false` is hard-coded, independent of `ctx.isStaff` — `ctx.isStaff: true` here only
 * bypasses `getActorAccessibleIntake`'s ownership check (the trusted request-reference comparison
 * above is the real authorization), never a signal that the caller should receive the staff/admin
 * response projection (`transcript_summary`, every `enrichment_*` field, `conversation_id`,
 * `address_id`, and the unredacted `metadata` block). This route's `actorPolicy` is
 * `human-or-anonymous`, so leaking that projection here would expose it to an anonymous caller.
 */
export const getIntakeStatusByRequestReference = async (
  params: { uuid: string; requestReference: string },
  ctx: IntakeActorContext
): Promise<IntakeStatusResponse> => {
  const { uuid, requestReference } = params;
  const intake = await getActorAccessibleIntake(uuid, ctx);
  if (intake.krabiclaw_request_key !== requestReference) {
    throw new HTTPException(404, { message: 'Practice client intake not found' });
  }
  return intakeSharedHelpers.formatIntakeStatusResponse(intake, { isAdmin: false });
};
