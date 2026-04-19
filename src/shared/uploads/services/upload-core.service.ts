import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { config } from '@/shared/config';
import { toSubject } from '@/shared/auth/subject-helpers';
import { auditLogsRepository } from '@/shared/uploads/queries/audit-logs.repository';
import { uploadsRepository } from '@/shared/uploads/queries/uploads.repository';
import { auditService } from '@/shared/uploads/services/audit.service';
import { keyGeneratorService } from '@/shared/uploads/services/key-generator.service';
import { r2Service } from '@/shared/uploads/services/r2.service';
import type { SelectUpload } from '@/shared/uploads/schema/uploads.schema';
import type {
  AuditLogEntry,
  AuditLogResponse,
  ConfirmUploadResponse,
  DownloadUrlResponse,
  ListUploadsQuery,
  ListUploadsResponse,
  PresignUploadRequest,
  PresignUploadResponse,
  UploadDetails,
} from '@/shared/uploads/types/uploads.types';
import type { ServiceContext } from '@/shared/types/service-context';

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

const assertCan = (ctx: ServiceContext, action: 'create' | 'read' | 'update' | 'delete', upload?: SelectUpload): void => {
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

const buildPublicUrl = (storageKey: string): string | null => {
  const publicUrlBase = config.cloudflare.r2PublicUrl;
  if (!publicUrlBase) {
    return null;
  }
  return `${publicUrlBase}/${storageKey}`;
};

const toUploadDetails = (upload: SelectUpload): UploadDetails => ({
  upload_id: upload.id,
  file_name: upload.file_name,
  file_type: upload.file_type,
  file_size: upload.file_size,
  mime_type: upload.mime_type,
  storage_provider: 'r2',
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
});

const toAuditLogEntry = (log: Awaited<ReturnType<typeof auditLogsRepository.findByUploadId>>[number]): AuditLogEntry => ({
  id: log.id,
  upload_id: log.upload_id,
  action: log.action as AuditLogEntry['action'],
  user_id: log.user_id,
  user_name: null,
  ip_address: log.ip_address,
  user_agent: log.user_agent,
  metadata:
    log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
      ? (log.metadata as Record<string, unknown>)
      : null,
  created_at: log.created_at,
});

const getUploadOrThrow = async (uploadId: string, ctx: ServiceContext): Promise<SelectUpload> => {
  const upload = await uploadsRepository.findById(uploadId, ctx.db);
  if (!upload) {
    throw new HTTPException(404, { message: 'Upload not found' });
  }
  return upload;
};

export const uploadCoreService = {
  async presignUpload({ request }: { request: PresignUploadRequest }, ctx: ServiceContext): Promise<PresignUploadResponse> {
    requireAuth(ctx);
    requireOrganizationContext(ctx);
    assertCan(ctx, 'create');

    const uploadId = crypto.randomUUID();
    const storageKey = keyGeneratorService.generateStorageKey({
      organizationId: ctx.organizationId,
      scopeType: request.scope_type,
      scopeId: request.scope_id,
      uploadId,
      fileName: request.file_name,
    });

    const bucket = getBucketOrThrow();
    const presignedUrl = await r2Service.generatePresignedUploadUrl({
      bucket,
      key: storageKey,
      contentType: request.mime_type,
      expiresIn: 15 * 60,
    });

    if (!presignedUrl) {
      throw new HTTPException(500, { message: 'Failed to generate presigned upload URL' });
    }

    const lastDotIndex = request.file_name.lastIndexOf('.');
    const fileType =
      lastDotIndex > 0 && lastDotIndex < request.file_name.length - 1
        ? request.file_name.slice(lastDotIndex + 1)
        : 'unknown';

    await uploadsRepository.create(
      {
        id: uploadId,
        user_id: ctx.userId,
        organization_id: ctx.organizationId,
        file_name: request.file_name,
        file_type: fileType,
        file_size: request.file_size,
        mime_type: request.mime_type,
        storage_provider: 'r2',
        storage_key: storageKey,
        scope_type: request.scope_type ?? null,
        scope_id: request.scope_id ?? null,
        status: 'pending',
        is_privileged: request.is_privileged ?? true,
        retention_until: null,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
      },
      ctx.db
    );

    await auditService.log(
      {
        upload_id: uploadId,
        organization_id: ctx.organizationId,
        action: 'created',
        user_id: ctx.userId,
      },
      ctx.db
    );

    return {
      upload_id: uploadId,
      presigned_url: presignedUrl,
      method: 'PUT',
      storage_key: storageKey,
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
    };
  },

  async confirmUpload({ id }: { id: string }, ctx: ServiceContext): Promise<ConfirmUploadResponse> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx);
    assertUploadAccess(upload, ctx, 'update');

    if (upload.status !== 'pending') {
      throw new HTTPException(400, { message: `Upload already ${upload.status}` });
    }

    const exists = await r2Service.verifyFileExists({
      bucket: getBucketOrThrow(),
      key: upload.storage_key,
    });

    if (!exists) {
      throw new HTTPException(400, { message: 'File not found in storage. Upload before confirming.' });
    }

    const publicUrl = buildPublicUrl(upload.storage_key);
    await uploadsRepository.update(
      id,
      {
        status: 'verified',
        verified_at: new Date(),
        public_url: publicUrl,
      },
      ctx.db
    );

    await auditService.log(
      {
        upload_id: id,
        organization_id: upload.organization_id ?? undefined,
        action: 'confirmed',
        user_id: ctx.userId,
      },
      ctx.db
    );

    return {
      upload_id: id,
      public_url: publicUrl,
      storage_key: upload.storage_key,
      status: 'verified',
    };
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

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const downloadUrl = await r2Service.generatePresignedDownloadUrl({
      bucket: getBucketOrThrow(),
      key: upload.storage_key,
      expiresIn: 15 * 60,
    });

    if (!downloadUrl) {
      throw new HTTPException(500, { message: 'Failed to generate presigned download URL' });
    }

    await uploadsRepository.updateLastAccessed(id, ctx.userId, ctx.db);

    await auditService.log(
      {
        upload_id: id,
        organization_id: upload.organization_id ?? undefined,
        action: 'downloaded',
        user_id: ctx.userId,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
      ctx.db
    );

    return {
      download_url: downloadUrl,
      expires_at: expiresAt,
    };
  },

  async getUpload({ id }: { id: string }, ctx: ServiceContext): Promise<UploadDetails> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx);
    assertUploadAccess(upload, ctx, 'read');

    await uploadsRepository.updateLastAccessed(id, ctx.userId, ctx.db);

    await auditService.log(
      {
        upload_id: id,
        organization_id: upload.organization_id ?? undefined,
        action: 'viewed',
        user_id: ctx.userId,
      },
      ctx.db
    );

    return toUploadDetails(upload);
  },

  async listUploads({ query }: { query: ListUploadsQuery }, ctx: ServiceContext): Promise<ListUploadsResponse> {
    requireAuth(ctx);
    requireOrganizationContext(ctx);
    assertCan(ctx, 'read');

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const [results, total] = await Promise.all([
      uploadsRepository.listByOrganization(
        ctx.organizationId,
        {
          scopeType: query.scope_type,
          scopeId: query.scope_id,
          status: query.status,
          includeDeleted: query.include_deleted,
          limit,
          offset,
        },
        ctx.db
      ),
      uploadsRepository.countByOrganization(
        ctx.organizationId,
        {
          scopeType: query.scope_type,
          scopeId: query.scope_id,
          status: query.status,
          includeDeleted: query.include_deleted,
        },
        ctx.db
      ),
    ]);

    return {
      uploads: results.map(toUploadDetails),
      total,
      page,
      limit,
    };
  },

  async softDelete({ id, reason }: { id: string; reason: string }, ctx: ServiceContext): Promise<{ id: string; status: string }> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx);
    assertUploadAccess(upload, ctx, 'delete');

    if (upload.deleted_at) {
      throw new HTTPException(400, { message: 'Upload already deleted' });
    }

    await uploadsRepository.softDelete(id, ctx.userId, reason, ctx.db);
    await auditService.log(
      {
        upload_id: id,
        organization_id: upload.organization_id ?? undefined,
        action: 'deleted',
        user_id: ctx.userId,
        metadata: { reason },
      },
      ctx.db
    );

    return { id, status: 'rejected' };
  },

  async restoreUpload({ id }: { id: string }, ctx: ServiceContext): Promise<{ id: string; status: string }> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx);
    assertUploadAccess(upload, ctx, 'delete');

    if (!upload.deleted_at) {
      throw new HTTPException(400, { message: 'Upload is not deleted' });
    }

    await uploadsRepository.restore(id, ctx.db);
    await auditService.log(
      {
        upload_id: id,
        organization_id: upload.organization_id ?? undefined,
        action: 'restored',
        user_id: ctx.userId,
      },
      ctx.db
    );

    return { id, status: 'pending' };
  },

  async getAuditLogs({ id }: { id: string }, ctx: ServiceContext): Promise<AuditLogResponse> {
    requireAuth(ctx);

    const upload = await getUploadOrThrow(id, ctx);
    assertUploadAccess(upload, ctx, 'read');

    const [logs, total] = await Promise.all([
      auditLogsRepository.findByUploadId(id, 100, ctx.db),
      auditLogsRepository.countByUploadId(id, ctx.db),
    ]);

    return {
      audit_logs: logs.map(toAuditLogEntry),
      total,
    };
  },
};

logger.debug('Upload core service initialized');
