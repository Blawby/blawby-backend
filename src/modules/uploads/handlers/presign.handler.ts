import type { Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { createUploadsService } from '@/modules/uploads/services/uploads.service';
import type { PresignUploadRequest } from '@/modules/uploads/validations/uploads.validation';

export const presignHandler = async (c: Context<AppContext>) => {
  // Validation happens in middleware via zValidator
  // Type assertion is safe because validation is guaranteed
  const body = (await c.req.json()) as PresignUploadRequest;
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
    // Log the full error for debugging
    console.error('[Presign Handler] Error generating presigned URL:', error);

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
