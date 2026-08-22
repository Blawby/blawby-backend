import { HTTPException } from 'hono/http-exception';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type { IntakeStatusResponse } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

export const getIntakeById = async (id: string, ctx: LegalOperationContext): Promise<IntakeStatusResponse> => {
  const intake = await practiceClientIntakesRepository.findById(id);
  if (!intake) {
    throw new HTTPException(404, { message: 'Practice client intake not found' });
  }

  assertLegalOperationTenant(ctx, intake.organization_id);

  return intakeSharedHelpers.formatIntakeStatusResponse(intake, { isAdmin: true });
};
