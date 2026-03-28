import { getLogger } from '@logtape/logtape';
import { auditLogsRepository } from '@/modules/uploads/database/queries/audit-logs.repository';
import { uploadsRepository } from '@/modules/uploads/database/queries/uploads.repository';
import { auditService } from '@/modules/uploads/services/audit.service';
import { storageProviderService } from '@/modules/uploads/services/storage-provider.service';
import { uploadsSharedService } from '@/modules/uploads/services/uploads.shared';
import type {
  AuditLogResponse,
  DownloadUploadParams,
  DownloadUrlResponse,
  ListUploadsParams,
  ListUploadsResponse,
  UploadDetails,
  UploadIdParams,
} from '@/modules/uploads/types/uploads.types';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { badRequest, internalError, notFound, ok } from '@/shared/utils/result';

const logger = getLogger(['uploads', 'queries-service']);

export const uploadQueriesService = {
  async getUploadDetails({ id: uploadId }: UploadIdParams, ctx: ServiceContext): Promise<Result<UploadDetails>> {
    uploadsSharedService.assertUploadReadAccess(ctx);

    const authResult = uploadsSharedService.requireAuthenticatedUser(ctx);
    if (authResult) {
      return authResult;
    }

    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      const accessResult = uploadsSharedService.ensureUploadAccess(upload, ctx, 'read');
      if (accessResult) {
        return accessResult;
      }

      await uploadsRepository.updateLastAccessed(uploadId, ctx.userId);

      await auditService.createAuditLog({
        upload_id: uploadId,
        organization_id: upload.organization_id ?? undefined,
        action: 'viewed',
        user_id: ctx.userId,
      });

      return ok(uploadsSharedService.mapUploadDetails(upload));
    } catch (error) {
      logger.error('Failed to get upload details for {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to retrieve upload details');
    }
  },

  async getDownloadUrl(
    { id: uploadId, ipAddress, userAgent }: DownloadUploadParams,
    ctx: ServiceContext
  ): Promise<Result<DownloadUrlResponse>> {
    uploadsSharedService.assertUploadReadAccess(ctx);

    const authResult = uploadsSharedService.requireAuthenticatedUser(ctx);
    if (authResult) {
      return authResult;
    }

    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      const accessResult = uploadsSharedService.ensureUploadAccess(upload, ctx, 'read');
      if (accessResult) {
        return accessResult;
      }

      if (upload.status !== 'verified') {
        return badRequest('Upload is not verified or confirmed');
      }

      const downloadResult = await storageProviderService.createDownloadUrl(upload);
      if (!downloadResult.success) {
        return downloadResult;
      }

      await uploadsRepository.updateLastAccessed(uploadId, ctx.userId);

      await auditService.createAuditLog({
        upload_id: uploadId,
        organization_id: upload.organization_id ?? undefined,
        action: 'downloaded',
        user_id: ctx.userId,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      return ok({
        download_url: downloadResult.data.downloadUrl,
        expires_at: downloadResult.data.expiresAt,
      });
    } catch (error) {
      logger.error('Failed to generate download URL for {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to generate download URL');
    }
  },

  async listUploads(query: ListUploadsParams, ctx: ServiceContext): Promise<Result<ListUploadsResponse>> {
    uploadsSharedService.assertUploadReadAccess(ctx);

    const orgResult = uploadsSharedService.requireOrganizationContext(ctx);
    if (orgResult) {
      return orgResult;
    }

    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const offset = (page - 1) * limit;

      const [results, total] = await Promise.all([
        uploadsRepository.listByOrganization(ctx.organizationId, {
          matterId: query.matter_id,
          uploadContext: query.upload_context,
          entityId: query.entity_id,
          status: query.status,
          includeDeleted: query.include_deleted,
          limit,
          offset,
        }),
        uploadsRepository.countByOrganization(ctx.organizationId, {
          matterId: query.matter_id,
          uploadContext: query.upload_context,
          entityId: query.entity_id,
          status: query.status,
          includeDeleted: query.include_deleted,
        }),
      ]);

      return ok({
        uploads: results.map((u) => uploadsSharedService.mapUploadDetails(u)),
        total,
        page,
        limit,
      });
    } catch (error) {
      logger.error('Failed to list uploads for org {organizationId}: {error}', {
        organizationId: ctx.organizationId,
        error,
      });
      return internalError('Failed to list uploads');
    }
  },

  async getAuditLogs({ id: uploadId }: UploadIdParams, ctx: ServiceContext): Promise<Result<AuditLogResponse>> {
    uploadsSharedService.assertUploadReadAccess(ctx);

    const authResult = uploadsSharedService.requireAuthenticatedUser(ctx);
    if (authResult) {
      return authResult;
    }

    try {
      const upload = await uploadsRepository.findById(uploadId);
      if (!upload) {
        return notFound('Upload not found');
      }

      const accessResult = uploadsSharedService.ensureUploadAccess(upload, ctx, 'read');
      if (accessResult) {
        return accessResult;
      }

      const logs = await auditLogsRepository.findByUploadId(uploadId, 100);
      const auditLogs = logs.map(uploadsSharedService.mapAuditLogEntry);

      return ok({
        audit_logs: auditLogs,
        total: auditLogs.length,
      });
    } catch (error) {
      logger.error('Failed to get audit logs for {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to retrieve audit logs');
    }
  },
};
