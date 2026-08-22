import {
  getActorAccessibleIntake,
  type IntakeActorContext,
} from '@/modules/practice-client-intakes/operations/intake-actor-context';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type { IntakeStatusResponse } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';

export const getIntakeStatus = async (
  params: { uuid: string },
  ctx: IntakeActorContext
): Promise<IntakeStatusResponse> => {
  const intake = await getActorAccessibleIntake(params.uuid, ctx);

  return intakeSharedHelpers.formatIntakeStatusResponse(intake, {
    requestingUserId: ctx.userId ?? undefined,
    isAdmin: ctx.isStaff,
  });
};
