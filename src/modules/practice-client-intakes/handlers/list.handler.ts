import { listIntakesRoute } from '@/modules/practice-client-intakes/routes';
import { practiceClientIntakesService } from '@/modules/practice-client-intakes/services/practice-client-intakes.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

/**
 * GET /api/practice/{practice_id}/client-intakes
 */
export const listIntakesHandler: AppRouteHandler<typeof listIntakesRoute> = async (c) => {
  const { practice_id: practiceId } = c.req.valid('param');
  const query = c.req.valid('query');

  const result = await practiceClientIntakesService.listIntakes(practiceId, query);

  return response.fromResult(c, result);
};
