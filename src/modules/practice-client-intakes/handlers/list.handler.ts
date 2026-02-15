import type { Context } from 'hono';

import { practiceClientIntakesService } from '@/modules/practice-client-intakes/services/practice-client-intakes.service';
import { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';

import { response } from '@/shared/utils/responseUtils';

/**
 * GET /api/practice/{practice_id}/client-intakes
 */
export const listIntakesHandler = async (c: Context) => {
  const practiceId = c.req.param('practice_id');

  const queryParams = c.req.query();
  const validatedQuery = intakeValidations.listIntakesQuerySchema.safeParse(queryParams);

  if (!validatedQuery.success) {
    return response.badRequest(c, 'Invalid query parameters', validatedQuery.error.flatten());
  }

  const result = await practiceClientIntakesService.listIntakes(practiceId, validatedQuery.data);

  return response.fromResult(c, result);
};
