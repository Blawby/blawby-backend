import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';

const getIntakeById = async (uuid: string): Promise<SelectPracticeClientIntake> => {
  const intake = await practiceClientIntakesRepository.findById(uuid);
  if (!intake) {
    throw new HTTPException(404, { message: 'Practice client intake not found' });
  }
  return intake;
};

export const getActorAccessibleIntake = async (
  uuid: string,
  ctx: ServiceContext,
  action: 'read' | 'update'
): Promise<SelectPracticeClientIntake> => {
  const intake = await getIntakeById(uuid);

  if (ctx.memberRole) {
    ForbiddenError.from(ctx.ability).throwUnlessCan(action, 'PracticeClientIntake');
    if (!ctx.organizationId || intake.organization_id !== ctx.organizationId) {
      throw new HTTPException(403, { message: 'Access denied' });
    }
    return intake;
  }

  if (intake.metadata?.user_id !== ctx.userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return intake;
};

export const getStaffAccessibleIntake = async (
  uuid: string,
  ctx: ServiceContext,
  action: 'read' | 'update'
): Promise<SelectPracticeClientIntake> => {
  if (!ctx.memberRole) {
    throw new HTTPException(403, { message: 'You do not have permission to access this intake' });
  }
  return getActorAccessibleIntake(uuid, ctx, action);
};

export const ensureStaffOrganizationAccess = (organizationId: string, ctx: ServiceContext): void => {
  if (!ctx.memberRole) {
    throw new HTTPException(403, { message: 'You do not have permission to access these intakes' });
  }
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'PracticeClientIntake');
  if (!ctx.organizationId || ctx.organizationId !== organizationId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }
};
