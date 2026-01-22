import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { createUploadsService } from '@/modules/uploads/services/uploads.service';
import { logError } from '@/shared/middleware/logger';
import { presignUploadRoute } from '@/modules/uploads/routes';

export const presignHandler: AppRouteHandler<typeof presignUploadRoute> = async (c) => {
  const body = c.req.valid('json');
  const userId = c.get('userId');
  const organizationId = c.get('activeOrganizationId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  if (!organizationId && body.upload_context !== 'profile') {
    return response.badRequest(c, 'Organization context required for non-profile uploads');
  }

  try {
    const uploadsService = createUploadsService();
    const result = await uploadsService.presignUpload(
      body,
      userId,
      organizationId || '', // Will be validated in service for non-profile
    );

    return response.created(c, result);
  } catch (error) {
    logError(error, {
      method: c.req.method,
      url: c.req.url,
      statusCode: 500,
      userId,
      organizationId: organizationId || undefined,
    });

    // Classify error: check if it's a known validation/client error
    const isClientError = error instanceof Error && (
      error.message.includes('validation') ||
      error.message.includes('required') ||
      error.message.includes('invalid')
    );

    if (isClientError) {
      return response.badRequest(c, 'Invalid request parameters');
    }

    // For unexpected errors, return generic internal server error
    return response.internalServerError(c, 'Internal server error');
  }
};
