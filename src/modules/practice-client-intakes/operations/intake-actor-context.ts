import { HTTPException } from 'hono/http-exception';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

/**
 * `isStaff` is a resolved actor classification, not a CASL ability — the wrapping service has
 * already run `ForbiddenError.from(ctx.ability).throwUnlessCan(...)` before delegating here, so
 * this flag only tells the operation whether the row-ownership check below should be skipped.
 */
export interface IntakeActorContext extends LegalOperationContext {
  isStaff: boolean;
}

/**
 * Resolve an intake and enforce actor-level access (KTD19): staff callers are already
 * authorized by the wrapping service's CASL check and only need the tenant assertion; a
 * non-staff actor may only reach an intake it owns via `metadata.user_id`, preserving the
 * anonymous-vs-client-owner distinction from the pre-extraction `getActorAccessibleIntake`.
 */
export const getActorAccessibleIntake = async (
  uuid: string,
  ctx: IntakeActorContext
): Promise<SelectPracticeClientIntake> => {
  const intake = await practiceClientIntakesRepository.findById(uuid);
  if (!intake) {
    throw new HTTPException(404, { message: 'Practice client intake not found' });
  }

  assertLegalOperationTenant(ctx, intake.organization_id);

  if (ctx.isStaff) {
    return intake;
  }

  if (!intake.metadata?.user_id) {
    throw new HTTPException(403, { message: 'Client user is not linked to this intake' });
  }

  if (intake.metadata.user_id !== ctx.userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return intake;
};
