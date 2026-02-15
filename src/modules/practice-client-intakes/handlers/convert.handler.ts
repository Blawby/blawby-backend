import type { Context } from 'hono';

import { practiceClientIntakesService } from '@/modules/practice-client-intakes/services/practice-client-intakes.service';
import { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';

import { response } from '@/shared/utils/responseUtils';


/**
 * POST /api/practice/client-intakes/{uuid}/convert
 */
export const convertIntakeHandler = async (c: Context) => {
  const uuid = c.req.param('uuid');
  const organizationId = c.get('organizationId');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return response.badRequest(c, 'Invalid JSON body');
  }

  const validatedBody = intakeValidations.convertIntakeSchema.safeParse(body);
  if (!validatedBody.success) {
    return response.badRequest(c, 'Invalid request body', validatedBody.error.flatten());
  }

  const result = await practiceClientIntakesService.convertIntakeToMatter(
    uuid,
    organizationId,
    validatedBody.data,
  );

  return response.fromResult(c, result);
};
