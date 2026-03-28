import { getLogger } from '@logtape/logtape';
import { uploadsRepository } from '@/modules/uploads/database/queries/uploads.repository';
import { auditService } from '@/modules/uploads/services/audit.service';
import { storageProviderService } from '@/modules/uploads/services/storage-provider.service';
import { uploadsSharedService } from '@/modules/uploads/services/uploads.shared';
import type {
  ConfirmUploadResponse,
  DeleteUploadParams,
  UploadIdParams,
  UploadMutationResponse,
} from '@/modules/uploads/types/uploads.types';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { badRequest, internalError, notFound, ok } from '@/shared/utils/result';

const logger = getLogger(['uploads', 'confirm-service']);

export const uploadConfirmService = {
  async confirmUpload({ id: uploadId }: UploadIdParams, ctx: ServiceContext): Promise<Result<ConfirmUploadResponse>> {
    uploadsSharedService.assertUploadUpdateAccess(ctx);

    const authResult = uploadsSharedService.requireAuthenticatedUser(ctx);
    if (authResult) {
      return authResult;
    }

    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      const accessResult = uploadsSharedService.ensureUploadAccess(upload, ctx, 'update');
      if (accessResult) {
        return accessResult;
      }

      if (upload.status !== 'pending') {
        return badRequest(`Upload already ${upload.status}`);
      }

      const verifyResult = await storageProviderService.verifyStoredUpload(upload);
      if (!verifyResult.success) {
        return verifyResult;
      }

      const publicUrlResult = storageProviderService.buildPublicUrl(upload);
      if (!publicUrlResult.success) {
        return publicUrlResult;
      }

      const updated = await uploadsRepository.update(uploadId, {
        status: 'verified',
        verified_at: new Date(),
        public_url: publicUrlResult.data,
      });

      if (!updated) {
        return internalError('Failed to update upload status');
      }

      await auditService.createAuditLog({
        upload_id: uploadId,
        organization_id: upload.organization_id ?? undefined,
        action: 'confirmed',
        user_id: ctx.userId,
      });

      logger.info('Confirmed upload {uploadId}', {
        uploadId,
        organizationId: upload.organization_id,
      });

      return ok({
        upload_id: uploadId,
        public_url: publicUrlResult.data ?? '',
        storage_key: upload.storage_key ?? '',
        status: 'verified',
      });
    } catch (error) {
      logger.error('Failed to confirm upload {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to confirm upload');
    }
  },

  async deleteUpload(
    { id: uploadId, request }: DeleteUploadParams,
    ctx: ServiceContext
  ): Promise<Result<UploadMutationResponse>> {
    uploadsSharedService.assertUploadDeleteAccess(ctx);

    const authResult = uploadsSharedService.requireAuthenticatedUser(ctx);
    if (authResult) {
      return authResult;
    }

    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      const accessResult = uploadsSharedService.ensureUploadAccess(upload, ctx, 'delete');
      if (accessResult) {
        return accessResult;
      }

      if (upload.deleted_at) {
        return badRequest('Upload already deleted');
      }

      await uploadsRepository.softDelete(uploadId, ctx.userId, request.reason);

      await auditService.createAuditLog({
        upload_id: uploadId,
        organization_id: upload.organization_id ?? undefined,
        action: 'deleted',
        user_id: ctx.userId,
        metadata: { reason: request.reason },
      });

      logger.info('Soft deleted upload {uploadId}', { uploadId, userId: ctx.userId, reason: request.reason });

      return ok({ id: uploadId, status: 'rejected' }); // Status is rejected for deleted/soft-deleted generally if not specifically status deleted
    } catch (error) {
      logger.error('Failed to delete upload {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to delete upload');
    }
  },

  async restoreUpload({ id: uploadId }: UploadIdParams, ctx: ServiceContext): Promise<Result<UploadMutationResponse>> {
    uploadsSharedService.assertUploadDeleteAccess(ctx);

    const authResult = uploadsSharedService.requireAuthenticatedUser(ctx);
    if (authResult) {
      return authResult;
    }

    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      const accessResult = uploadsSharedService.ensureUploadAccess(upload, ctx, 'delete');
      if (accessResult) {
        return accessResult;
      }

      if (!upload.deleted_at) {
        return badRequest('Upload is not deleted');
      }

      await uploadsRepository.restore(uploadId);

      await auditService.createAuditLog({
        upload_id: uploadId,
        organization_id: upload.organization_id ?? undefined,
        action: 'restored',
        user_id: ctx.userId,
      });

      logger.info('Restored upload {uploadId}', { uploadId, userId: ctx.userId });

      return ok({ id: uploadId, status: 'pending' }); // Restored back to pending generally
    } catch (error) {
      logger.error('Failed to restore upload {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to restore upload');
    }
  },
};
