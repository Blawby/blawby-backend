import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { forbidden, notFound, ok } from '@/shared/utils/result';

const getIntakeById = async (uuid: string): Promise<Result<SelectPracticeClientIntake>> => {
  const intake = await practiceClientIntakesRepository.findById(uuid);
  if (!intake) {
    return notFound('Practice client intake not found');
  }
  return ok(intake);
};

export const getActorAccessibleIntake = async (
  uuid: string,
  ctx: ServiceContext,
  action: 'read' | 'update'
): Promise<Result<SelectPracticeClientIntake>> => {
  const intakeResult = await getIntakeById(uuid);
  if (!intakeResult.success) {
    return intakeResult;
  }

  const intake = intakeResult.data;

  if (ctx.memberRole) {
    if (ctx.ability.cannot(action, 'PracticeClientIntake')) {
      return forbidden('You do not have permission to access this intake');
    }
    if (!ctx.organizationId || intake.organization_id !== ctx.organizationId) {
      return forbidden('Access denied');
    }
    return ok(intake);
  }

  if (intake.metadata?.user_id !== ctx.userId) {
    return forbidden('Access denied');
  }

  return ok(intake);
};

export const getStaffAccessibleIntake = async (
  uuid: string,
  ctx: ServiceContext,
  action: 'read' | 'update'
): Promise<Result<SelectPracticeClientIntake>> => {
  if (!ctx.memberRole) {
    return forbidden('You do not have permission to access this intake');
  }
  return getActorAccessibleIntake(uuid, ctx, action);
};

export const ensureStaffOrganizationAccess = (organizationId: string, ctx: ServiceContext): Result<void> => {
  if (!ctx.memberRole) {
    return forbidden('You do not have permission to access these intakes');
  }
  if (ctx.ability.cannot('read', 'PracticeClientIntake')) {
    return forbidden('You do not have permission to read intakes');
  }
  if (!ctx.organizationId || ctx.organizationId !== organizationId) {
    return forbidden('Access denied');
  }
  return ok(undefined);
};
