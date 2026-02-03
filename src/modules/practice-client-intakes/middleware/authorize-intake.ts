import type { MiddlewareHandler } from 'hono';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const isOwner = (params: {
  intakeUserId?: string | null;
  sessionUserId?: string | null;
}): boolean => {
  const { intakeUserId, sessionUserId } = params;
  return Boolean(intakeUserId && sessionUserId && intakeUserId === sessionUserId);
};

export const attachIntakeOwnership = (): MiddlewareHandler<AppContext> => {
  return async (c, next) => {
    const uuid = c.req.param('uuid');
    const sessionUserId = c.get('userId');

    if (!uuid) {
      return next();
    }

    const intake = await practiceClientIntakesRepository.findById(uuid);
    const owner = isOwner({
      intakeUserId: intake?.metadata?.user_id ?? null,
      sessionUserId,
    });

    c.set('intakeOwner', owner);
    return next();
  };
};

export const authorizeIntakeOwnership = (): MiddlewareHandler<AppContext> => {
  return async (c, next) => {
    const uuid = c.req.param('uuid');
    const sessionUserId = c.get('userId');

    if (!uuid) {
      return response.badRequest(c, 'Missing intake UUID');
    }

    if (!sessionUserId) {
      return response.unauthorized(c, 'Authentication required');
    }

    const intake = await practiceClientIntakesRepository.findById(uuid);
    if (!intake) {
      return response.notFound(c, 'Practice client intake not found');
    }

    const owner = isOwner({
      intakeUserId: intake.metadata?.user_id ?? null,
      sessionUserId,
    });

    if (!owner) {
      return response.forbidden(c, 'You do not own this intake');
    }

    c.set('intakeOwner', true);
    return next();
  };
};
