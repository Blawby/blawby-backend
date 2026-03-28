import { getLogger } from '@logtape/logtape';
import { auditService } from '@/modules/uploads/services/audit.service';
import { storageProviderService } from '@/modules/uploads/services/storage-provider.service';
import { uploadsRepository } from '@/modules/uploads/database/queries/uploads.repository';
import { uploadsSharedService } from '@/modules/uploads/services/uploads.shared';
import type { InsertUpload } from '@/modules/uploads/database/schema/uploads.schema';
import type { PresignUploadParams, PresignUploadResponse } from '@/modules/uploads/types/uploads.types';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { internalError, ok } from '@/shared/utils/result';

const logger = getLogger(['uploads', 'presign-service']);

const resolveStorageProvider = (uploadContext: string, mimeType: string): 'r2' | 'images' =>
  uploadContext === 'profile' && mimeType.startsWith('image/') ? 'images' : 'r2';

const resolveEntityType = (uploadContext: string): 'matter' | 'intake' | null => {
  if (uploadContext === 'matter' || uploadContext === 'intake') {
    return uploadContext;
  }

  return null;
};

const createStorageKeyResult = (
  request: PresignUploadParams['request'],
  ctx: ServiceContext,
  uploadId: string
): Result<string> =>
  uploadsSharedService.generateStorageKey({
    organizationId: ctx.organizationId,
    userId: request.upload_context === 'profile' ? ctx.userId : undefined,
    uploadContext: request.upload_context,
    uploadId,
    fileName: request.file_name,
    matterId: request.matter_id,
    entityId: request.entity_id,
    subContext: request.sub_context,
  });

export const uploadPresignService = {
  async presignUpload({ request }: PresignUploadParams, ctx: ServiceContext): Promise<Result<PresignUploadResponse>> {
    uploadsSharedService.assertUploadCreateAccess(ctx);

    const authResult = uploadsSharedService.requireAuthenticatedUser(ctx);
    if (authResult) {
      return authResult;
    }

    if (request.upload_context !== 'profile') {
      const orgResult = uploadsSharedService.requireOrganizationContext(ctx);
      if (orgResult) {
        return orgResult;
      }
    }

    try {
      const uploadId = crypto.randomUUID();
      const storageProvider = resolveStorageProvider(request.upload_context, request.mime_type);

      const storageKeyResult = createStorageKeyResult(request, ctx, uploadId);
      if (!storageKeyResult.success) {
        return storageKeyResult;
      }

      const storageKey = storageKeyResult.data;

      const uploadTarget = await storageProviderService.createUploadTarget({
        storageProvider,
        storageKey,
        mimeType: request.mime_type,
      });

      if (!uploadTarget.success) {
        return uploadTarget;
      }

      const recordExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const fileName = request.file_name;
      const lastDotIndex = fileName.lastIndexOf('.');
      const fileType =
        lastDotIndex > 0 && lastDotIndex < fileName.length - 1 ? fileName.slice(lastDotIndex + 1) : 'unknown';

      const uploadData: InsertUpload = {
        id: uploadId,
        user_id: ctx.userId,
        organization_id: request.upload_context === 'profile' ? null : ctx.organizationId,
        file_name: request.file_name,
        file_type: fileType,
        file_size: request.file_size,
        mime_type: request.mime_type,
        storage_provider: storageProvider,
        storage_key: storageKey,
        upload_context: request.upload_context,
        matter_id: request.matter_id ?? null,
        entity_type: resolveEntityType(request.upload_context),
        entity_id: request.entity_id ?? null,
        status: 'pending',
        is_privileged: request.is_privileged ?? true,
        retention_until: uploadsSharedService.calculateRetentionUntil(request.upload_context),
        uploaded_by: ctx.userId,
        expires_at: recordExpiresAt,
      };

      await uploadsRepository.create(uploadData);

      await auditService.createAuditLog({
        upload_id: uploadId,
        organization_id: ctx.organizationId ?? undefined,
        action: 'created',
        user_id: ctx.userId,
      });

      logger.info('Generated presigned URL for upload {uploadId}', {
        uploadId,
        storageProvider,
      });

      return ok({
        upload_id: uploadId,
        presigned_url: uploadTarget.data.presignedUrl,
        method: uploadTarget.data.method,
        storage_key: storageKey,
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });
    } catch (error) {
      logger.error('Failed to generate presigned URL: {error}', { error });
      return internalError('Failed to generate upload URL');
    }
  },
};
