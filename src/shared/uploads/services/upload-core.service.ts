import { toSubject } from '@/shared/auth/subject-helpers';
import { config } from '@/shared/config';
import type { ServiceContext } from '@/shared/types/service-context';
import { auditLogsRepository } from '@/shared/uploads/queries/audit-logs.repository';
import { uploadsRepository } from '@/shared/uploads/queries/uploads.repository';
import type { SelectUpload } from '@/shared/uploads/schema/uploads.schema';
import { auditService } from '@/shared/uploads/services/audit.service';
import { cloudflareImagesService } from '@/shared/uploads/services/cloudflare-images.service';
import { keyGeneratorService } from '@/shared/uploads/services/key-generator.service';
import { r2Service } from '@/shared/uploads/services/r2.service';
import {
  buildUploadMetadataEnrichment,
  defaultUploadMetadataEnrichment,
  type UploadMetadataEnrichment,
} from '@/shared/uploads/services/upload-enrichment.service';
import type {
  AuditLogEntry,
  AuditLogResponse,
  ConfirmUploadResponse,
  DownloadUrlResponse,
  ListUploadsQuery,
  ListUploadsResponse,
  PresignUploadRequest,
  PresignUploadResponse,
  ThumbnailQuery,
  ThumbnailUrlResponse,
  UploadDetails,
} from '@/shared/uploads/types/uploads.types';
import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['uploads', 'core-service']);

const requireOrganizationContext = (ctx: ServiceContext): void => {
  if (!ctx.organizationId) {
    throw new HTTPException(400, { message: 'Organization context required' });
  }
};

const requireAuth = (ctx: ServiceContext): void => {
  if (!ctx.userId) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }
};

const assertCan = (
  ctx: ServiceContext,
  action: 'create' | 'read' | 'update' | 'delete',
  upload?: SelectUpload
): void => {
  try {
    if (upload) {
      ForbiddenError.from(ctx.ability).throwUnlessCan(action, toSubject('Upload', upload));
      return;
    }
    ForbiddenError.from(ctx.ability).throwUnlessCan(action, 'Upload');
  } catch (error) {
    if (error instanceof ForbiddenError) {
      throw new HTTPException(403, { message: 'Access denied' });
    }
    throw error;
  }
};

const assertUploadAccess = (upload: SelectUpload, ctx: ServiceContext, action: 'read' | 'update' | 'delete'): void => {
  assertCan(ctx, action, upload);

  if (!ctx.organizationId || upload.organization_id !== ctx.organizationId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }
};

const getBucketOrThrow = (): string => {
  const bucket = config.cloudflare.r2BucketName;
  if (!bucket) {
    throw new HTTPException(500, { message: 'Storage configuration error' });
  }
  return bucket;
};

const getImagesConfigOrThrow = (): { accountId: string; accountHash: string; apiToken: string } => {
  const { accountId } = config.cloudflare;
  const accountHash = config.cloudflare.imagesAccountHash;
  const apiToken = config.cloudflare.imagesApiToken;
  if (!accountId || !accountHash || !apiToken) {
    throw new HTTPException(500, { message: 'Image storage configuration error' });
  }
  return { accountId, accountHash, apiToken };
};

const buildPublicUrl = (storageKey: string): string | null => {
  const publicUrlBase = config.cloudflare.r2PublicUrl;
  if (!publicUrlBase) {
    return null;
  }
  return `${publicUrlBase}/${storageKey}`;
};

const isImageMimeType = (mimeType: string): boolean => mimeType.toLowerCase().startsWith('image/');

const buildCloudflareResizedUrl = ({
  sourceUrl,
  width,
  height,
  fit,
}: {
  sourceUrl: string;
  width: number;
  height: number;
  fit: 'contain' | 'cover' | 'scale-down';
}): string => {
  const { origin } = new URL(sourceUrl);
  const resizeParams = `width=${width},height=${height},fit=${fit},metadata=none`;
  return `${origin}/cdn-cgi/image/${resizeParams}/${sourceUrl}`;
};

const buildInlineThumbnail = (
  upload: SelectUpload
): { hasThumbnail: boolean; thumbnailUrl: string | null; thumbnailExpiresAt: Date | null } => {
  if (upload.status !== 'verified' || !isImageMimeType(upload.mime_type)) {
    return { hasThumbnail: false, thumbnailUrl: null, thumbnailExpiresAt: null };
  }

  if (upload.storage_provider === 'images') {
    return {
      hasThumbnail: Boolean(upload.public_url),
      thumbnailUrl: upload.public_url ?? null,
      thumbnailExpiresAt: null,
    };
  }

  const basePublicUrl = upload.public_url ?? buildPublicUrl(upload.storage_key);
  if (!basePublicUrl) {
    // Thumbnail endpoint can still return a short-lived presigned URL on demand.
    return {
      hasThumbnail: true,
      thumbnailUrl: null,
      thumbnailExpiresAt: null,
    };
  }

  return {
    hasThumbnail: true,
    thumbnailUrl: buildCloudflareResizedUrl({
      sourceUrl: basePublicUrl,
      width: 320,
      height: 320,
      fit: 'contain',
    }),
    thumbnailExpiresAt: null,
  };
};

const toUploadDetails = (
  upload: SelectUpload,
  enrichment: UploadMetadataEnrichment = defaultUploadMetadataEnrichment
): UploadDetails => {
  const thumbnail = buildInlineThumbnail(upload);

  return {
    upload_id: upload.id,
    file_name: upload.file_name,
    file_type: upload.file_type,
    file_size: upload.file_size,
    mime_type: upload.mime_type,
    storage_provider: upload.storage_provider as 'r2' | 'images',
    storage_key: upload.storage_key,
    public_url: upload.public_url,
    scope_type: (upload.scope_type as UploadDetails['scope_type']) ?? null,
    scope_id: upload.scope_id,
    status: upload.status as UploadDetails['status'],
    is_privileged: upload.is_privileged ?? true,
    retention_until: upload.retention_until ?? null,
    created_at: upload.created_at,
    verified_at: upload.verified_at ?? null,
    uploaded_by: upload.user_id,
    uploaded_by_name: enrichment.uploadedByName,
    uploaded_by_email: enrichment.uploadedByEmail,
    scope_label: enrichment.scopeLabel,
    has_thumbnail: thumbnail.hasThumbnail,
    thumbnail_url: thumbnail.thumbnailUrl,
    thumbnail_expires_at: thumbnail.thumbnailExpiresAt,
  };
};

const toAuditLogEntry = (
  log: Awaited<ReturnType<typeof auditLogsRepository.findByUploadId>>[number]
): AuditLogEntry => ({
  id: log.id,
  upload_id: log.upload_id,
  action: log.action as AuditLogEntry['action'],
  user_id: log.user_id,
  user_name: null,
  ip_address: log.ip_address,
  user_agent: log.user_agent,
  metadata: log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata) ? log.metadata : null,
  created_at: log.created_at,
});

const getUploadOrThrow = async (
  uploadId: string,
  ctx: ServiceContext,
  includeDeleted = false
): Promise<SelectUpload> => {
  const upload = await uploadsRepository.findById(uploadId);
  if (!upload) {
    throw new HTTPException(404, { message: 'Upload not found' });
  }
  if (!includeDeleted && upload.deleted_at) {
    throw new HTTPException(404, { message: 'Upload not found' });
  }
  return upload;
};

interface PresignPreparation {
  uploadId: string;
  storageKey: string;
  storageProvider: 'r2' | 'images';
  presignedUrl: string;
  method: 'PUT' | 'POST';
  fileType: string;
}

interface ConfirmPreparation {
  upload: SelectUpload;
  publicUrl: string | null;
  actualMimeType: string | null;
  actualFileSize: number | null;
}

const uploadCoreService = {
  // Step 1: auth + external call only — no DB, safe to run outside a transaction
  async preparePresign(
    { request }: { request: PresignUploadRequest },
    ctx: ServiceContext
  ): Promise<PresignPreparation> {
    requireAuth(ctx);
    requireOrganizationContext(ctx);
    assertCan(ctx, 'create');

    const uploadId = crypto.randomUUID();
    const isProfileUpload = request.scope_type === 'profile';

    const lastDotIndex = request.file_name.lastIndexOf('.');
    const fileType =
      lastDotIndex > 0 && lastDotIndex < request.file_name.length - 1
        ? request.file_name.slice(lastDotIndex + 1)
        : 'unknown';

    if (isProfileUpload) {
      const { accountId, apiToken } = getImagesConfigOrThrow();
      const target = await cloudflareImagesService.generateDirectUploadUrl({ accountId, apiToken });
      if (!target) {
        throw new HTTPException(500, { message: 'Failed to generate image upload URL' });
      }
      return {
        uploadId,
        storageKey: target.imageId,
        storageProvider: 'images',
        presignedUrl: target.uploadUrl,
        method: 'POST',
        fileType,
      };
    }

    const storageKey = keyGeneratorService.generateStorageKey({
      organizationId: ctx.organizationId,
      scopeType: request.scope_type,
      scopeId: request.scope_id,
      uploadId,
      fileName: request.file_name,
    });
    const url = await r2Service.generatePresignedUploadUrl({
      bucket: getBucketOrThrow(),
      key: storageKey,
      contentType: request.mime_type,
      expiresIn: 15 * 60,
    });
    if (!url) {
      throw new HTTPException(500, { message: 'Failed to generate presigned upload URL' });
    }
    return { uploadId, storageKey, storageProvider: 'r2', presignedUrl: url, method: 'PUT', fileType };
  },

  // Step 2: DB writes only — run inside a transaction
  async persistPresign(
    { prep, request }: { prep: PresignPreparation; request: PresignUploadRequest },
    ctx: ServiceContext
  ): Promise<PresignUploadResponse> {
    await uploadsRepository.create({
      id: prep.uploadId,
      user_id: ctx.userId,
      organization_id: ctx.organizationId,
      file_name: request.file_name,
      file_type: prep.fileType,
      file_size: request.file_size,
      mime_type: request.mime_type,
      storage_provider: prep.storageProvider,
      storage_key: prep.storageKey,
      scope_type: request.scope_type ?? null,
      scope_id: request.scope_id ?? null,
      status: 'pending',
      is_privileged: request.is_privileged ?? true,
      retention_until: null,
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    });

    await auditService.log({
      upload_id: prep.uploadId,
      organization_id: ctx.organizationId,
      action: 'created',
      user_id: ctx.userId,
    });

    return {
      upload_id: prep.uploadId,
      presigned_url: prep.presignedUrl,
      method: prep.method,
      storage_key: prep.storageKey,
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
    };
  },

  // Step 1: DB read + external verify — no mutations, safe to run outside a transaction
  async prepareConfirm({ id }: { id: string }, ctx: ServiceContext): Promise<ConfirmPreparation> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx);
    assertUploadAccess(upload, ctx, 'update');

    if (upload.status !== 'pending') {
      throw new HTTPException(400, { message: `Upload already ${upload.status}` });
    }

    if (upload.storage_provider === 'images') {
      const { accountHash } = getImagesConfigOrThrow();
      return {
        upload,
        publicUrl: cloudflareImagesService.getImageUrl({ accountHash, imageId: upload.storage_key }),
        actualMimeType: null,
        actualFileSize: null,
      };
    }

    const metadata = await r2Service.getFileMetadata({ bucket: getBucketOrThrow(), key: upload.storage_key });
    if (!metadata.exists) {
      throw new HTTPException(400, { message: 'File not found in storage. Upload before confirming.' });
    }
    return {
      upload,
      publicUrl: buildPublicUrl(upload.storage_key),
      actualMimeType: metadata.contentType,
      actualFileSize: metadata.contentLength,
    };
  },

  // Step 2: DB writes only — run inside a transaction
  async persistConfirm({ prep }: { prep: ConfirmPreparation }, ctx: ServiceContext): Promise<ConfirmUploadResponse> {
    const { upload, publicUrl, actualMimeType, actualFileSize } = prep;

    await uploadsRepository.update(upload.id, {
      status: 'verified',
      verified_at: new Date(),
      public_url: publicUrl,
      ...(actualMimeType !== null && actualMimeType !== undefined && { mime_type: actualMimeType }),
      ...(actualFileSize !== null && actualFileSize !== undefined && { file_size: actualFileSize }),
    });
    await auditService.log({
      upload_id: upload.id,
      organization_id: upload.organization_id ?? undefined,
      action: 'confirmed',
      user_id: ctx.userId,
    });

    return { upload_id: upload.id, public_url: publicUrl, storage_key: upload.storage_key, status: 'verified' };
  },

  async getDownloadUrl(
    { id, ipAddress, userAgent }: { id: string; ipAddress?: string; userAgent?: string },
    ctx: ServiceContext
  ): Promise<DownloadUrlResponse> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx);
    assertUploadAccess(upload, ctx, 'read');

    if (upload.status !== 'verified') {
      throw new HTTPException(400, { message: 'Upload must be verified before download' });
    }

    let downloadUrl: string | undefined = undefined;
    let expiresAt: Date | null = null;

    if (upload.storage_provider === 'images') {
      if (!upload.public_url) {
        throw new HTTPException(400, { message: 'Download URL not available for this image' });
      }
      downloadUrl = upload.public_url;
      expiresAt = null;
    } else {
      expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const url = await r2Service.generatePresignedDownloadUrl({
        bucket: getBucketOrThrow(),
        key: upload.storage_key,
        expiresIn: 15 * 60,
      });
      if (!url) {
        throw new HTTPException(500, { message: 'Failed to generate presigned download URL' });
      }
      downloadUrl = url;
    }

    await uploadsRepository.updateLastAccessed(id, ctx.userId);

    await auditService.log({
      upload_id: id,
      organization_id: upload.organization_id ?? undefined,
      action: 'downloaded',
      user_id: ctx.userId,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return {
      download_url: downloadUrl,
      expires_at: expiresAt,
    };
  },

  async getThumbnailUrl(
    { id, query, ipAddress, userAgent }: { id: string; query: ThumbnailQuery; ipAddress?: string; userAgent?: string },
    ctx: ServiceContext
  ): Promise<ThumbnailUrlResponse> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx);
    assertUploadAccess(upload, ctx, 'read');

    if (upload.status !== 'verified') {
      throw new HTTPException(400, { message: 'Upload must be verified before thumbnail access' });
    }

    if (!isImageMimeType(upload.mime_type)) {
      throw new HTTPException(400, { message: 'Thumbnails are only available for image uploads' });
    }

    const width = query.width ?? 320;
    const height = query.height ?? 320;
    const fit = query.fit ?? 'contain';

    let thumbnailUrl: string;
    let expiresAt: Date | null;

    if (upload.storage_provider === 'images') {
      if (!upload.public_url) {
        throw new HTTPException(400, { message: 'Thumbnail URL not available for this image' });
      }
      const isDefault = width === 320 && height === 320 && fit === 'contain';
      if (isDefault) {
        thumbnailUrl = upload.public_url;
      } else {
        // Cloudflare Images flexible variant: https://imagedelivery.net/<ACCOUNT_HASH>/<IMAGE_ID>/<variant>
        const match = /^https:\/\/imagedelivery\.net\/([^/]+)\/([^/]+)/.exec(upload.public_url);
        if (!match) {
          throw new HTTPException(400, { message: 'Unsupported thumbnail params for this image provider' });
        }
        const [, accountHash, imageId] = match;
        thumbnailUrl = `https://imagedelivery.net/${accountHash}/${imageId}/w=${width},h=${height},fit=${fit}`;
      }
      expiresAt = null;
    } else {
      const basePublicUrl = upload.public_url ?? buildPublicUrl(upload.storage_key);
      if (basePublicUrl) {
        thumbnailUrl = buildCloudflareResizedUrl({ sourceUrl: basePublicUrl, width, height, fit });
        expiresAt = null;
      } else {
        expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const url = await r2Service.generatePresignedDownloadUrl({
          bucket: getBucketOrThrow(),
          key: upload.storage_key,
          expiresIn: 15 * 60,
        });
        if (!url) {
          throw new HTTPException(500, { message: 'Failed to generate thumbnail URL' });
        }
        thumbnailUrl = url;
      }
    }

    await uploadsRepository.updateLastAccessed(id, ctx.userId);

    await auditService.log({
      upload_id: id,
      organization_id: upload.organization_id ?? undefined,
      action: 'viewed',
      user_id: ctx.userId,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: { kind: 'thumbnail', width, height, fit },
    });

    return {
      thumbnail_url: thumbnailUrl,
      expires_at: expiresAt,
    };
  },

  async getUpload({ id }: { id: string }, ctx: ServiceContext): Promise<UploadDetails> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx);
    assertUploadAccess(upload, ctx, 'read');

    const organizationId = upload.organization_id ?? ctx.organizationId;
    if (!organizationId) {
      throw new HTTPException(400, { message: 'Organization context required' });
    }

    const enrichmentMap = await buildUploadMetadataEnrichment([upload], { organizationId });

    await uploadsRepository.updateLastAccessed(id, ctx.userId);

    await auditService.log({
      upload_id: id,
      organization_id: upload.organization_id ?? undefined,
      action: 'viewed',
      user_id: ctx.userId,
    });

    return toUploadDetails(upload, enrichmentMap.get(upload.id) ?? defaultUploadMetadataEnrichment);
  },

  async listUploads({ query }: { query: ListUploadsQuery }, ctx: ServiceContext): Promise<ListUploadsResponse> {
    requireAuth(ctx);
    requireOrganizationContext(ctx);
    assertCan(ctx, 'read');

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    // CLIENT users can only see their own uploads (per CASL ability conditions)
    const userIdFilter = ctx.memberRole === 'client' ? ctx.userId : undefined;

    const [results, total] = await Promise.all([
      uploadsRepository.listByOrganization(ctx.organizationId, {
        scopeType: query.scope_type,
        scopeId: query.scope_id,
        status: query.status,
        includeDeleted: query.include_deleted,
        userId: userIdFilter,
        limit,
        offset,
      }),
      uploadsRepository.countByOrganization(ctx.organizationId, {
        scopeType: query.scope_type,
        scopeId: query.scope_id,
        status: query.status,
        includeDeleted: query.include_deleted,
        userId: userIdFilter,
      }),
    ]);

    const enrichmentMap = await buildUploadMetadataEnrichment(results, { organizationId: ctx.organizationId });

    return {
      uploads: results.map((upload) =>
        toUploadDetails(upload, enrichmentMap.get(upload.id) ?? defaultUploadMetadataEnrichment)
      ),
      total,
      page,
      limit,
    };
  },

  async softDelete(
    { id, reason }: { id: string; reason: string },
    ctx: ServiceContext
  ): Promise<{ id: string; status: string }> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx, true);
    assertUploadAccess(upload, ctx, 'delete');

    if (upload.deleted_at) {
      throw new HTTPException(400, { message: 'Upload already deleted' });
    }

    await uploadsRepository.softDelete(id, ctx.userId, reason);
    await auditService.log({
      upload_id: id,
      organization_id: upload.organization_id ?? undefined,
      action: 'deleted',
      user_id: ctx.userId,
      metadata: { reason },
    });

    return { id, status: 'rejected' };
  },

  async restoreUpload({ id }: { id: string }, ctx: ServiceContext): Promise<{ id: string; status: string }> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx, true);
    assertUploadAccess(upload, ctx, 'delete');

    if (!upload.deleted_at) {
      throw new HTTPException(400, { message: 'Upload is not deleted' });
    }

    await uploadsRepository.restore(id);
    await auditService.log({
      upload_id: id,
      organization_id: upload.organization_id ?? undefined,
      action: 'restored',
      user_id: ctx.userId,
    });

    return { id, status: 'pending' };
  },

  async getAuditLogs(
    { id, page = 1, limit = 50 }: { id: string; page?: number; limit?: number },
    ctx: ServiceContext
  ): Promise<AuditLogResponse> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx);
    assertUploadAccess(upload, ctx, 'read');

    const cappedLimit = Math.min(limit, 100);
    const offset = (page - 1) * cappedLimit;

    const [logs, total] = await Promise.all([
      auditLogsRepository.findByUploadId(id, { limit: cappedLimit, offset }),
      auditLogsRepository.countByUploadId(id),
    ]);

    return {
      audit_logs: logs.map(toAuditLogEntry),
      total,
    };
  },
};

logger.debug('Upload core service initialized');

export { toUploadDetails, uploadCoreService };
