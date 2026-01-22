import type { Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import type { PresignUploadRequest } from '@/modules/uploads/validations/uploads.validation';

export const presignHandler = async (c: Context<AppContext>) => {
  const body = (await c.req.json()) as PresignUploadRequest;
  const userId = c.get('userId');
  const organizationId = c.get('activeOrganizationId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  if (!organizationId && body.upload_context !== 'profile') {
    return response.badRequest(c, 'Organization context required for non-profile uploads');
  }

  const result = await uploadsService.presignUpload(
    body,
    userId,
    organizationId ?? null,
  );

  return response.fromResult(c, result, 201);
};
