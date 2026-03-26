import type { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import type { presignUploadRoute } from '@/modules/uploads/routes';

export const presignHandler: AppRouteHandler<typeof presignUploadRoute> = async (c) => {
  const userId = c.get('userId');
  const organizationId = c.get('activeOrganizationId');
  const validatedBody = c.req.valid('json');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  const result = await uploadsService.presignUpload(validatedBody, userId, organizationId ?? null);

  return response.fromResult(c, result, 201);
};
