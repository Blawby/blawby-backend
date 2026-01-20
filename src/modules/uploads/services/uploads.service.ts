/**
 * Uploads Service
 *
 * Orchestrates file upload flow with compliance features
 */

import { getLogger } from '@logtape/logtape';
import { uploadsRepository } from '@/modules/uploads/database/queries/uploads.repository';
import { auditLogsRepository } from '@/modules/uploads/database/queries/audit-logs.repository';
import { generatePresignedUploadUrl, verifyFileExists, generatePresignedDownloadUrl } from './cloudflare-r2.service';
import { generateImagesUploadUrl, getImageUrl } from './cloudflare-images.service';
import { createAuditLog } from './audit.service';
import type {
  PresignUploadRequest,
  PresignUploadResponse,
  ConfirmUploadResponse,
  UploadDetails,
  DeleteUploadRequest,
  ListUploadsQuery,
  ListUploadsResponse,
  DownloadUrlResponse,
} from '@/modules/uploads/types/uploads.types';
import type { InsertUpload } from '@/modules/uploads/database/schema/uploads.schema';
import type { Result } from '@/shared/types/result';
import { ok, badRequest, notFound, internalError, forbidden } from '@/shared/utils/result';

const logger = getLogger(['uploads', 'service']);

/**
 * Sanitize filename for storage
 */
const sanitizeFileName = (fileName: string): string => {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\./, '_')
    .substring(0, 255);
};

/**
 * Generate storage key based on upload context
 */
const generateStorageKey = (params: {
  organizationId?: string;
  userId?: string;
  uploadContext: 'matter' | 'intake' | 'trust' | 'profile' | 'asset';
  uploadId: string;
  fileName: string;
  matterId?: string;
  entityId?: string;
  subContext?: 'documents' | 'correspondence' | 'evidence';
}): string => {
  const sanitizedFileName = sanitizeFileName(params.fileName);

  if (params.uploadContext === 'profile' && params.userId) {
    return `users/${params.userId}/profile/${params.uploadId}_${sanitizedFileName}`;
  }

  if (!params.organizationId) {
    throw new Error('Organization ID required for non-profile uploads');
  }

  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  switch (params.uploadContext) {
    case 'matter': {
      if (!params.matterId) {
        throw new Error('Matter ID required for matter uploads');
      }
      const subFolder = params.subContext || 'documents';
      return `orgs/${params.organizationId}/matters/${params.matterId}/${subFolder}/${params.uploadId}_${sanitizedFileName}`;
    }

    case 'intake':
      if (!params.entityId) {
        throw new Error('Entity ID (intake ID) required for intake uploads');
      }
      return `orgs/${params.organizationId}/intakes/${params.entityId}/${params.uploadId}_${sanitizedFileName}`;

    case 'trust':
      return `orgs/${params.organizationId}/trust-accounting/${year}/${month}/${params.uploadId}_${sanitizedFileName}`;

    case 'asset':
      return `orgs/${params.organizationId}/firm-assets/${params.uploadId}_${sanitizedFileName}`;

    default:
      return `orgs/${params.organizationId}/misc/${params.uploadId}_${sanitizedFileName}`;
  }
};

/**
 * Calculate retention date based on upload context
 */
const calculateRetentionUntil = (
  uploadContext: 'matter' | 'intake' | 'trust' | 'profile' | 'asset',
): Date | null => {
  const now = new Date();
  const yearsToRetain = 7;

  switch (uploadContext) {
    case 'matter':
    case 'intake':
    case 'trust':
      return new Date(now.getFullYear() + yearsToRetain, now.getMonth(), now.getDate());
    case 'profile':
    case 'asset':
      return null;
    default:
      return null;
  }
};

/**
 * Uploads Service
 */
export const uploadsService = {
  /**
   * Generate presigned URL for upload
   */
  async presignUpload(
    request: PresignUploadRequest,
    userId: string,
    organizationId: string,
  ): Promise<Result<PresignUploadResponse>> {
    try {
      const uploadId = crypto.randomUUID();
      const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;

      if (!bucket) {
        logger.error('CLOUDFLARE_R2_BUCKET_NAME not configured');
        return internalError('Storage configuration error');
      }

      // Determine storage provider based on context
      const isImage = request.upload_context === 'profile' || request.mime_type.startsWith('image/');
      const storageProvider = isImage && request.upload_context === 'profile' ? 'images' : 'r2';

      // Generate storage key
      let storageKey: string;
      try {
        storageKey = generateStorageKey({
          organizationId,
          userId: request.upload_context === 'profile' ? userId : undefined,
          uploadContext: request.upload_context,
          uploadId,
          fileName: request.file_name,
          matterId: request.matter_id,
          entityId: request.entity_id,
          subContext: request.sub_context,
        });
      } catch (err) {
        return badRequest(err instanceof Error ? err.message : 'Invalid upload context');
      }

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      const recordExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      let presignedUrl: string;
      let method: string;

      if (storageProvider === 'images') {
        const accountHash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
        const apiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
        if (!accountHash || !apiToken) {
          logger.error('Cloudflare Images not configured');
          return internalError('Image storage configuration error');
        }
        const { uploadUrl } = await generateImagesUploadUrl({
          accountHash,
          apiToken,
        });
        presignedUrl = uploadUrl;
        method = 'POST';
      } else {
        presignedUrl = await generatePresignedUploadUrl({
          bucket,
          key: storageKey,
          contentType: request.mime_type,
          expiresIn: 15 * 60,
        });
        method = 'PUT';
      }

      const fileName = request.file_name;
      const lastDotIndex = fileName.lastIndexOf('.');
      const fileType = lastDotIndex > 0 && lastDotIndex < fileName.length - 1
        ? fileName.slice(lastDotIndex + 1)
        : 'unknown';

      // Create upload record
      const uploadData: InsertUpload = {
        id: uploadId,
        userId,
        organizationId,
        fileName: request.file_name,
        fileType,
        fileSize: request.file_size,
        mimeType: request.mime_type,
        storageProvider,
        storageKey,
        uploadContext: request.upload_context,
        matterId: request.matter_id || null,
        entityType: request.upload_context === 'matter' ? 'matter' : request.upload_context === 'intake' ? 'intake' : null,
        entityId: request.entity_id || null,
        status: 'pending',
        isPrivileged: request.is_privileged ?? true,
        retentionUntil: calculateRetentionUntil(request.upload_context),
        uploadedBy: userId,
        expiresAt: recordExpiresAt,
      };

      await uploadsRepository.create(uploadData);

      // Create audit log
      await createAuditLog({
        uploadId,
        organizationId,
        action: 'created',
        userId,
      });

      logger.info('Generated presigned URL for upload {uploadId} ({fileName})', {
        uploadId,
        fileName: request.file_name,
        storageProvider,
      });

      return ok({
        upload_id: uploadId,
        presigned_url: presignedUrl,
        method,
        storage_key: storageKey,
        expires_at: expiresAt.toISOString(),
      });
    } catch (error) {
      logger.error('Failed to generate presigned URL: {error}', { error });
      return internalError('Failed to generate upload URL');
    }
  },

  /**
   * Confirm upload completion
   */
  async confirmUpload(
    uploadId: string,
    userId: string,
  ): Promise<Result<ConfirmUploadResponse>> {
    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      if (upload.status !== 'pending') {
        return badRequest(`Upload already ${upload.status}`);
      }

      const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
      const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL;

      if (!bucket) {
        logger.error('CLOUDFLARE_R2_BUCKET_NAME not configured');
        return internalError('Storage configuration error');
      }

      // Verify file exists in storage
      if (upload.storageProvider === 'r2' && upload.storageKey) {
        const exists = await verifyFileExists({
          bucket,
          key: upload.storageKey,
        });

        if (!exists) {
          logger.warn('File not found in storage for upload {uploadId}', { uploadId, storageKey: upload.storageKey });
          return badRequest('File not found in storage. Please ensure upload succeeded before confirming.');
        }
      }

      // Generate public URL
      let publicUrl: string | null = null;
      if (upload.storageProvider === 'r2' && upload.storageKey && publicUrlBase) {
        publicUrl = `${publicUrlBase}/${upload.storageKey}`;
      } else if (upload.storageProvider === 'images' && upload.storageKey) {
        const accountHash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
        if (!accountHash) {
          logger.error('CLOUDFLARE_IMAGES_ACCOUNT_HASH not configured');
          return internalError('Image storage configuration error');
        }
        publicUrl = getImageUrl({
          accountHash,
          imageId: upload.storageKey,
        });
      }

      // Update upload status
      const updated = await uploadsRepository.update(uploadId, {
        status: 'verified',
        verifiedAt: new Date(),
        publicUrl,
      });

      if (!updated) {
        return internalError('Failed to update upload status');
      }

      // Create audit log
      await createAuditLog({
        uploadId,
        organizationId: upload.organizationId || undefined,
        action: 'confirmed',
        userId,
      });

      logger.info('Confirmed upload {uploadId}', { uploadId, organizationId: upload.organizationId });

      return ok({
        upload_id: uploadId,
        public_url: publicUrl || '',
        storage_key: upload.storageKey || '',
        status: 'verified' as const,
      });
    } catch (error) {
      logger.error('Failed to confirm upload {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to confirm upload');
    }
  },

  /**
   * Get upload details
   */
  async getUploadDetails(uploadId: string, userId: string): Promise<Result<UploadDetails>> {
    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      // Update last accessed
      await uploadsRepository.updateLastAccessed(uploadId, userId);

      // Create audit log
      await createAuditLog({
        uploadId,
        organizationId: upload.organizationId || undefined,
        action: 'viewed',
        userId,
      });

      return ok({
        upload_id: upload.id,
        file_name: upload.fileName,
        file_type: upload.fileType,
        file_size: upload.fileSize,
        mime_type: upload.mimeType,
        storage_provider: upload.storageProvider as 'r2' | 'images',
        storage_key: upload.storageKey || '',
        public_url: upload.publicUrl,
        upload_context: upload.uploadContext as 'matter' | 'intake' | 'trust' | 'profile' | 'asset',
        matter_id: upload.matterId,
        entity_id: upload.entityId,
        status: upload.status as 'pending' | 'verified' | 'rejected',
        is_privileged: upload.isPrivileged ?? true,
        retention_until: upload.retentionUntil?.toISOString() || null,
        created_at: upload.createdAt.toISOString(),
        verified_at: upload.verifiedAt?.toISOString() || null,
        uploaded_by: upload.uploadedBy,
      });
    } catch (error) {
      logger.error('Failed to get upload details for {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to retrieve upload details');
    }
  },

  /**
   * Get download URL (presigned)
   */
  async getDownloadUrl(
    uploadId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Result<DownloadUrlResponse>> {
    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      if (upload.status !== 'verified') {
        return badRequest('Upload is not verified or confirmed');
      }

      if (!upload.storageKey) {
        return internalError('Storage key missing for verified upload');
      }

      const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
      if (!bucket && upload.storageProvider === 'r2') {
        logger.error('CLOUDFLARE_R2_BUCKET_NAME not configured');
        return internalError('Storage configuration error');
      }

      let downloadUrl: string;
      const expiresAt = upload.storageProvider === 'r2'
        ? new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
        : null;

      if (upload.storageProvider === 'r2') {
        downloadUrl = await generatePresignedDownloadUrl({
          bucket: bucket!,
          key: upload.storageKey,
          expiresIn: 15 * 60,
        });
      } else {
        // Images - use public URL
        if (!upload.publicUrl) {
          return badRequest('Download URL not available for this image');
        }
        downloadUrl = upload.publicUrl;
      }

      // Update last accessed
      await uploadsRepository.updateLastAccessed(uploadId, userId);

      // Create audit log
      await createAuditLog({
        uploadId,
        organizationId: upload.organizationId || undefined,
        action: 'downloaded',
        userId,
        ipAddress,
        userAgent,
      });

      return ok({
        download_url: downloadUrl,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
      });
    } catch (error) {
      logger.error('Failed to generate download URL for {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to generate download URL');
    }
  },

  /**
   * Soft delete upload
   */
  async deleteUpload(
    uploadId: string,
    userId: string,
    request: DeleteUploadRequest,
  ): Promise<Result<void>> {
    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      if (upload.deletedAt) {
        return badRequest('Upload already deleted');
      }

      // Soft delete
      await uploadsRepository.softDelete(uploadId, userId, request.reason);

      // Create audit log
      await createAuditLog({
        uploadId,
        organizationId: upload.organizationId || undefined,
        action: 'deleted',
        userId,
        metadata: { reason: request.reason },
      });

      logger.info('Soft deleted upload {uploadId}', { uploadId, userId, reason: request.reason });

      return ok(undefined);
    } catch (error) {
      logger.error('Failed to delete upload {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to delete upload');
    }
  },

  /**
   * Restore soft-deleted upload
   */
  async restoreUpload(uploadId: string, userId: string): Promise<Result<void>> {
    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      if (!upload.deletedAt) {
        return badRequest('Upload is not deleted');
      }

      // Restore
      await uploadsRepository.restore(uploadId);

      // Create audit log
      await createAuditLog({
        uploadId,
        organizationId: upload.organizationId || undefined,
        action: 'restored',
        userId,
      });

      logger.info('Restored upload {uploadId}', { uploadId, userId });

      return ok(undefined);
    } catch (error) {
      logger.error('Failed to restore upload {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to restore upload');
    }
  },

  /**
   * List uploads
   */
  async listUploads(
    organizationId: string,
    query: ListUploadsQuery,
  ): Promise<Result<ListUploadsResponse>> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 20;
      const offset = (page - 1) * limit;

      const listOptions = {
        matterId: query.matter_id,
        uploadContext: query.upload_context,
        entityId: query.entity_id,
        status: query.status,
        includeDeleted: query.include_deleted,
        limit,
        offset,
      };

      // Execute count and list queries in parallel
      const [results, totalResults] = await Promise.all([
        uploadsRepository.listByOrganization(organizationId, listOptions),
        uploadsRepository.listByOrganization(organizationId, {
          ...listOptions,
          limit: undefined,
          offset: undefined,
        }),
      ]);

      const uploads: UploadDetails[] = results.map((upload) => ({
        upload_id: upload.id,
        file_name: upload.fileName,
        file_type: upload.fileType,
        file_size: upload.fileSize,
        mime_type: upload.mimeType,
        storage_provider: upload.storageProvider as 'r2' | 'images',
        storage_key: upload.storageKey || '',
        public_url: upload.publicUrl,
        upload_context: upload.uploadContext as 'matter' | 'intake' | 'trust' | 'profile' | 'asset',
        matter_id: upload.matterId,
        entity_id: upload.entityId,
        status: upload.status as 'pending' | 'verified' | 'rejected',
        is_privileged: upload.isPrivileged ?? true,
        retention_until: upload.retentionUntil?.toISOString() || null,
        created_at: upload.createdAt.toISOString(),
        verified_at: upload.verifiedAt?.toISOString() || null,
        uploaded_by: upload.uploadedBy,
      }));

      const total = totalResults.length;

      return ok({
        uploads,
        total,
        page,
        limit,
      });
    } catch (error) {
      logger.error('Failed to list uploads for org {organizationId}: {error}', { organizationId, error });
      return internalError('Failed to list uploads');
    }
  },

  /**
   * Get audit logs for an upload
   */
  async getAuditLogs(
    uploadId: string,
    organizationId: string,
  ): Promise<Result<{ audit_logs: any[]; total: number }>> {
    try {
      const upload = await uploadsRepository.findById(uploadId);
      if (!upload) {
        return notFound('Upload not found');
      }

      if (upload.organizationId !== organizationId) {
        return forbidden('Access denied');
      }

      const logs = await auditLogsRepository.findByUploadId(uploadId, 100);

      const auditLogs = logs.map((log) => ({
        id: log.id,
        upload_id: log.uploadId,
        action: log.action,
        user_id: log.userId,
        user_name: null, // TODO: Fetch from users table if needed
        ip_address: log.ipAddress,
        user_agent: log.userAgent,
        metadata: log.metadata,
        created_at: log.createdAt.toISOString(),
      }));

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

export default uploadsService;
