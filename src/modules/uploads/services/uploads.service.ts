/**
 * Uploads Service
 *
 * Orchestrates file upload flow with compliance features
 */

import { getLogger } from '@logtape/logtape';
import { createAuditLog } from './audit.service';
import { generateImagesUploadUrl, getImageUrl } from './cloudflare-images.service';
import { generatePresignedUploadUrl, verifyFileExists, generatePresignedDownloadUrl } from './cloudflare-r2.service';
import { auditLogsRepository } from '@/modules/uploads/database/queries/audit-logs.repository';
import { uploadsRepository } from '@/modules/uploads/database/queries/uploads.repository';
import type { InsertUpload } from '@/modules/uploads/database/schema/uploads.schema';
import type {
  PresignUploadRequest,
  PresignUploadResponse,
  ConfirmUploadResponse,
  UploadDetails,
  DeleteUploadRequest,
  ListUploadsQuery,
  ListUploadsResponse,
  DownloadUrlResponse,
  AuditLogEntry,
} from '@/modules/uploads/types/uploads.types';
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
  organization_id?: string;
  user_id?: string;
  upload_context: 'matter' | 'intake' | 'trust' | 'profile' | 'asset';
  uploadId: string;
  file_name: string;
  matter_id?: string;
  entity_id?: string;
  sub_context?: 'documents' | 'correspondence' | 'evidence';
}): string => {
  const sanitizedFileName = sanitizeFileName(params.file_name);

  if (params.upload_context === 'profile' && params.user_id) {
    return `users/${params.user_id}/profile/${params.uploadId}_${sanitizedFileName}`;
  }

  if (!params.organization_id) {
    throw new Error('Organization ID required for non-profile uploads');
  }

  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  switch (params.upload_context) {
    case 'matter': {
      if (!params.matter_id) {
        throw new Error('Matter ID required for matter uploads');
      }
      const subFolder = params.sub_context || 'documents';
      return `orgs/${params.organization_id}/matters/${params.matter_id}/${subFolder}/${params.uploadId}_${sanitizedFileName}`;
    }

    case 'intake':
      if (!params.entity_id) {
        throw new Error('Entity ID (intake ID) required for intake uploads');
      }
      return `orgs/${params.organization_id}/intakes/${params.entity_id}/${params.uploadId}_${sanitizedFileName}`;

    case 'trust':
      return `orgs/${params.organization_id}/trust-accounting/${year}/${month}/${params.uploadId}_${sanitizedFileName}`;

    case 'asset':
      return `orgs/${params.organization_id}/firm-assets/${params.uploadId}_${sanitizedFileName}`;

    default:
      return `orgs/${params.organization_id}/misc/${params.uploadId}_${sanitizedFileName}`;
  }
};

/**
 * Calculate retention date based on upload context
 */
const calculateRetentionUntil = (upload_context: 'matter' | 'intake' | 'trust' | 'profile' | 'asset'): Date | null => {
  const now = new Date();
  const yearsToRetain = 7;

  switch (upload_context) {
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
    organizationId: string | null
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
      let storage_key: string;
      try {
        storage_key = generateStorageKey({
          organization_id: organizationId ?? undefined,
          user_id: request.upload_context === 'profile' ? userId : undefined,
          upload_context: request.upload_context,
          uploadId,
          file_name: request.file_name,
          matter_id: request.matter_id,
          entity_id: request.entity_id,
          sub_context: request.sub_context,
        });
      } catch (err) {
        return badRequest(err instanceof Error ? err.message : 'Invalid upload context');
      }

      const expires_at = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      const record_expires_at = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

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
          key: storage_key,
          contentType: request.mime_type,
          expiresIn: 15 * 60,
        });
        method = 'PUT';
      }

      const file_name = request.file_name;
      const lastDotIndex = file_name.lastIndexOf('.');
      const file_type =
        lastDotIndex > 0 && lastDotIndex < file_name.length - 1 ? file_name.slice(lastDotIndex + 1) : 'unknown';

      // Create upload record
      const uploadData: InsertUpload = {
        id: uploadId,
        user_id: userId,
        organization_id: organizationId,
        file_name: request.file_name,
        file_type: file_type,
        file_size: request.file_size,
        mime_type: request.mime_type,
        storage_provider: storageProvider,
        storage_key,
        upload_context: request.upload_context,
        matter_id: request.matter_id || null,
        entity_type:
          request.upload_context === 'matter' ? 'matter' : request.upload_context === 'intake' ? 'intake' : null,
        entity_id: request.entity_id || null,
        status: 'pending',
        is_privileged: request.is_privileged ?? true,
        retention_until: calculateRetentionUntil(request.upload_context),
        uploaded_by: userId,
        expires_at: record_expires_at,
      };

      await uploadsRepository.create(uploadData);

      // Create audit log
      await createAuditLog({
        upload_id: uploadId,
        organization_id: organizationId ?? undefined,
        action: 'created',
        user_id: userId,
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
        storage_key: storage_key,
        expires_at: expires_at,
      });
    } catch (error) {
      logger.error('Failed to generate presigned URL: {error}', { error });
      return internalError('Failed to generate upload URL');
    }
  },

  /**
   * Confirm upload completion
   */
  async confirmUpload(uploadId: string, userId: string): Promise<Result<ConfirmUploadResponse>> {
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
      if (upload.storage_provider === 'r2' && upload.storage_key) {
        const exists = await verifyFileExists({
          bucket,
          key: upload.storage_key,
        });

        if (!exists) {
          logger.warn('File not found in storage for upload {uploadId}', { uploadId, storageKey: upload.storage_key });
          return badRequest('File not found in storage. Please ensure upload succeeded before confirming.');
        }
      }

      // Generate public URL
      let publicUrl: string | null = null;
      if (upload.storage_provider === 'r2' && upload.storage_key && publicUrlBase) {
        publicUrl = `${publicUrlBase}/${upload.storage_key}`;
      } else if (upload.storage_provider === 'images' && upload.storage_key) {
        const accountHash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
        if (!accountHash) {
          logger.error('CLOUDFLARE_IMAGES_ACCOUNT_HASH not configured');
          return internalError('Image storage configuration error');
        }
        publicUrl = getImageUrl({
          accountHash,
          imageId: upload.storage_key,
        });
      }

      // Update upload status
      const updated = await uploadsRepository.update(uploadId, {
        status: 'verified',
        verified_at: new Date(),
        public_url: publicUrl,
      });

      if (!updated) {
        return internalError('Failed to update upload status');
      }

      // Create audit log
      await createAuditLog({
        upload_id: uploadId,
        organization_id: upload.organization_id || undefined,
        action: 'confirmed',
        user_id: userId,
      });

      logger.info('Confirmed upload {uploadId}', { uploadId, organizationId: upload.organization_id });

      return ok({
        upload_id: uploadId,
        public_url: publicUrl || '',
        storage_key: upload.storage_key || '',
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
        upload_id: uploadId,
        organization_id: upload.organization_id || undefined,
        action: 'viewed',
        user_id: userId,
      });

      return ok({
        upload_id: upload.id,
        file_name: upload.file_name,
        file_type: upload.file_type,
        file_size: upload.file_size,
        mime_type: upload.mime_type,
        storage_provider: upload.storage_provider as 'r2' | 'images',
        storage_key: upload.storage_key || '',
        public_url: upload.public_url,
        upload_context: upload.upload_context as 'matter' | 'intake' | 'trust' | 'profile' | 'asset',
        matter_id: upload.matter_id,
        entity_id: upload.entity_id,
        status: upload.status as 'pending' | 'verified' | 'rejected',
        is_privileged: upload.is_privileged ?? true,
        retention_until: upload.retention_until ?? null,
        created_at: upload.created_at,
        verified_at: upload.verified_at ?? null,
        uploaded_by: upload.uploaded_by,
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
    userAgent?: string
  ): Promise<Result<DownloadUrlResponse>> {
    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      if (upload.status !== 'verified') {
        return badRequest('Upload is not verified or confirmed');
      }

      if (!upload.storage_key) {
        return internalError('Storage key missing for verified upload');
      }

      const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
      if (!bucket && upload.storage_provider === 'r2') {
        logger.error('CLOUDFLARE_R2_BUCKET_NAME not configured');
        return internalError('Storage configuration error');
      }

      let downloadUrl: string;
      const expiresAt =
        upload.storage_provider === 'r2'
          ? new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
          : null;

      if (upload.storage_provider === 'r2') {
        downloadUrl = await generatePresignedDownloadUrl({
          bucket: bucket!,
          key: upload.storage_key,
          expiresIn: 15 * 60,
        });
      } else {
        // Images - use public URL
        if (!upload.public_url) {
          return badRequest('Download URL not available for this image');
        }
        downloadUrl = upload.public_url;
      }

      // Update last accessed
      await uploadsRepository.updateLastAccessed(uploadId, userId);

      // Create audit log
      await createAuditLog({
        upload_id: uploadId,
        organization_id: upload.organization_id || undefined,
        action: 'downloaded',
        user_id: userId,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      return ok({
        download_url: downloadUrl,
        expires_at: expiresAt,
      });
    } catch (error) {
      logger.error('Failed to generate download URL for {uploadId}: {error}', { uploadId, error });
      return internalError('Failed to generate download URL');
    }
  },

  /**
   * Soft delete upload
   */
  async deleteUpload(uploadId: string, userId: string, request: DeleteUploadRequest): Promise<Result<void>> {
    try {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        return notFound('Upload not found');
      }

      if (upload.deleted_at) {
        return badRequest('Upload already deleted');
      }

      // Soft delete
      await uploadsRepository.softDelete(uploadId, userId, request.reason);

      // Create audit log
      await createAuditLog({
        upload_id: uploadId,
        organization_id: upload.organization_id || undefined,
        action: 'deleted',
        user_id: userId,
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

      if (!upload.deleted_at) {
        return badRequest('Upload is not deleted');
      }

      // Restore
      await uploadsRepository.restore(uploadId);

      // Create audit log
      await createAuditLog({
        upload_id: uploadId,
        organization_id: upload.organization_id || undefined,
        action: 'restored',
        user_id: userId,
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
  async listUploads(organizationId: string, query: ListUploadsQuery): Promise<Result<ListUploadsResponse>> {
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
        file_name: upload.file_name,
        file_type: upload.file_type,
        file_size: upload.file_size,
        mime_type: upload.mime_type,
        storage_provider: upload.storage_provider as 'r2' | 'images',
        storage_key: upload.storage_key || '',
        public_url: upload.public_url,
        upload_context: upload.upload_context as 'matter' | 'intake' | 'trust' | 'profile' | 'asset',
        matter_id: upload.matter_id,
        entity_id: upload.entity_id,
        status: upload.status as 'pending' | 'verified' | 'rejected',
        is_privileged: upload.is_privileged ?? true,
        retention_until: upload.retention_until ?? null,
        created_at: upload.created_at,
        verified_at: upload.verified_at ?? null,
        uploaded_by: upload.uploaded_by,
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
    organizationId: string
  ): Promise<Result<{ audit_logs: AuditLogEntry[]; total: number }>> {
    try {
      const upload = await uploadsRepository.findById(uploadId);
      if (!upload) {
        return notFound('Upload not found');
      }

      if (upload.organization_id !== organizationId) {
        return forbidden('Access denied');
      }

      const logs = await auditLogsRepository.findByUploadId(uploadId, 100);

      const auditLogs = logs.map((log) => ({
        id: log.id,
        upload_id: log.upload_id,
        action: log.action as AuditLogEntry['action'],
        user_id: log.user_id,
        user_name: null, // TODO: Fetch from users table if needed
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        metadata: (log.metadata as Record<string, unknown>) ?? null,
        created_at: log.created_at,
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
