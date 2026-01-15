/**
 * Uploads Service
 *
 * Orchestrates file upload flow with compliance features
 */

import { uploadsRepository } from '@/modules/uploads/database/queries/uploads.repository';
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

/**
 * Sanitize filename for storage
 */
const sanitizeFileName = (fileName: string): string => {
  // Remove path separators and dangerous characters
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\./, '_')
    .substring(0, 255); // Limit length
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
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  // User profile uploads (not org-bound)
  if (params.uploadContext === 'profile' && params.userId) {
    return `users/${params.userId}/profile/${params.uploadId}_${sanitizedFileName}`;
  }

  if (!params.organizationId) {
    throw new Error('Organization ID required for non-profile uploads');
  }

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
  const yearsToRetain = 7; // Default retention period

  switch (uploadContext) {
    case 'matter':
    case 'intake':
    case 'trust':
      // 7 years from now (can be updated when matter closes)
      return new Date(now.getFullYear() + yearsToRetain, now.getMonth(), now.getDate());
    case 'profile':
    case 'asset':
      // No retention requirement
      return null;
    default:
      return null;
  }
};

/**
 * Create uploads service
 */
export const createUploadsService = () => {
  return {
    /**
     * Generate presigned URL for upload
     */
    async presignUpload(
      request: PresignUploadRequest,
      userId: string,
      organizationId: string,
    ): Promise<PresignUploadResponse> {
      const uploadId = crypto.randomUUID();
      const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
      const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL;

      if (!bucket) {
        throw new Error('CLOUDFLARE_R2_BUCKET_NAME environment variable is required');
      }

      // Determine storage provider based on context
      const isImage = request.upload_context === 'profile' || request.mime_type.startsWith('image/');
      const storageProvider = isImage && request.upload_context === 'profile' ? 'images' : 'r2';

      // Generate storage key
      const storageKey = generateStorageKey({
        organizationId,
        userId: request.upload_context === 'profile' ? userId : undefined,
        uploadContext: request.upload_context,
        uploadId,
        fileName: request.file_name,
        matterId: request.matter_id,
        entityId: request.entity_id,
        subContext: request.sub_context,
      });

      // Calculate expiration (15 minutes for presigned URL, 1 hour for pending upload record)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      const recordExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      let presignedUrl: string;
      let method: string;

      if (storageProvider === 'images') {
        // Cloudflare Images direct upload
        const accountHash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
        const apiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
        if (!accountHash || !apiToken) {
          throw new Error('Cloudflare Images credentials not configured');
        }
        const { uploadUrl } = await generateImagesUploadUrl({
          accountHash,
          apiToken,
        });
        presignedUrl = uploadUrl;
        method = 'POST';
      } else {
        // R2 presigned URL
        presignedUrl = await generatePresignedUploadUrl({
          bucket,
          key: storageKey,
          contentType: request.mime_type,
          expiresIn: 15 * 60, // 15 minutes
        });
        method = 'PUT';
      }

      // Create upload record
      const uploadData: InsertUpload = {
        id: uploadId,
        userId,
        organizationId,
        fileName: request.file_name,
        fileType: request.file_name.split('.').pop() || 'unknown',
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
        // IP and user agent should be passed from handler
      });

      return {
        upload_id: uploadId,
        presigned_url: presignedUrl,
        method,
        storage_key: storageKey,
        expires_at: expiresAt.toISOString(),
      };
    },

    /**
     * Confirm upload completion
     */
    async confirmUpload(
      uploadId: string,
      userId: string,
    ): Promise<ConfirmUploadResponse> {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        throw new Error('Upload not found');
      }

      if (upload.status !== 'pending') {
        throw new Error(`Upload already ${upload.status}`);
      }

      const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
      const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL;

      if (!bucket) {
        throw new Error('CLOUDFLARE_R2_BUCKET_NAME environment variable is required');
      }

      // Verify file exists in storage
      if (upload.storageProvider === 'r2' && upload.storageKey) {
        const exists = await verifyFileExists({
          bucket,
          key: upload.storageKey,
        });

        if (!exists) {
          throw new Error('File not found in storage');
        }
      }

      // Generate public URL
      let publicUrl: string | null = null;
      if (upload.storageProvider === 'r2' && upload.storageKey && publicUrlBase) {
        publicUrl = `${publicUrlBase}/${upload.storageKey}`;
      } else if (upload.storageProvider === 'images' && upload.storageKey) {
        const accountHash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
        if (!accountHash) {
          throw new Error('CLOUDFLARE_IMAGES_ACCOUNT_HASH environment variable is required for Cloudflare Images');
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
        throw new Error('Upload not found');
      }

      // Create audit log
      await createAuditLog({
        uploadId,
        organizationId: upload.organizationId || undefined,
        action: 'confirmed',
        userId,
      });

      return {
        upload_id: uploadId,
        public_url: publicUrl || '',
        storage_key: upload.storageKey || '',
        status: 'verified',
      };
    },

    /**
     * Get upload details
     */
    async getUploadDetails(uploadId: string, userId: string): Promise<UploadDetails> {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        throw new Error('Upload not found');
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

      return {
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
      };
    },

    /**
     * Get download URL (presigned)
     */
    async getDownloadUrl(
      uploadId: string,
      userId: string,
      ipAddress?: string,
      userAgent?: string,
    ): Promise<DownloadUrlResponse> {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        throw new Error('Upload not found');
      }

      if (upload.status !== 'verified') {
        throw new Error('Upload not verified');
      }

      if (!upload.storageKey) {
        throw new Error('Storage key not found');
      }

      const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;

      if (!bucket) {
        throw new Error('CLOUDFLARE_R2_BUCKET_NAME environment variable is required');
      }

      let downloadUrl: string;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      if (upload.storageProvider === 'r2') {
        downloadUrl = await generatePresignedDownloadUrl({
          bucket,
          key: upload.storageKey,
          expiresIn: 15 * 60,
        });
      } else {
        // Images - use public URL
        downloadUrl = upload.publicUrl || '';
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

      return {
        download_url: downloadUrl,
        expires_at: expiresAt.toISOString(),
      };
    },

    /**
     * Soft delete upload
     */
    async deleteUpload(
      uploadId: string,
      userId: string,
      request: DeleteUploadRequest,
    ): Promise<void> {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        throw new Error('Upload not found');
      }

      if (upload.deletedAt) {
        throw new Error('Upload already deleted');
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
    },

    /**
     * Restore soft-deleted upload
     */
    async restoreUpload(uploadId: string, userId: string): Promise<void> {
      const upload = await uploadsRepository.findById(uploadId);

      if (!upload) {
        throw new Error('Upload not found');
      }

      if (!upload.deletedAt) {
        throw new Error('Upload is not deleted');
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
    },

    /**
     * List uploads
     */
    async listUploads(
      organizationId: string,
      query: ListUploadsQuery,
    ): Promise<ListUploadsResponse> {
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

      return {
        uploads,
        total,
        page,
        limit,
      };
    },
  };
};
