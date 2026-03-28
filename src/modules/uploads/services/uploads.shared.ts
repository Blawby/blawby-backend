import { ForbiddenError } from '@casl/ability';
import type { SelectUploadAuditLog } from '@/modules/uploads/database/schema/upload-audit-logs.schema';
import type { SelectUpload } from '@/modules/uploads/database/schema/uploads.schema';
import type {
  AuditLogEntry,
  AuditAction,
  UploadContext,
  UploadDetails,
  UploadStatus,
  StorageProvider,
  SubContext,
} from '@/modules/uploads/types/uploads.types';
import type { ServiceContext } from '@/shared/types/service-context';
import type { Result } from '@/shared/types/result';
import { toSubject } from '@/shared/auth/subject-helpers';
import { badRequest, forbidden, ok, unauthorized } from '@/shared/utils/result';

const uploadContexts = ['matter', 'intake', 'trust', 'profile', 'asset'] as const;
const auditActions = ['created', 'viewed', 'downloaded', 'deleted', 'restored', 'confirmed'] as const;
const storageProviders = ['r2', 'images'] as const;
const uploadStatuses = ['pending', 'verified', 'rejected'] as const;

const assertUploadCreateAccess = (ctx: ServiceContext): void => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Upload');
};

const assertUploadReadAccess = (ctx: ServiceContext, upload?: SelectUpload): void => {
  if (upload) {
    ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Upload', upload));
    return;
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Upload');
};

const assertUploadUpdateAccess = (ctx: ServiceContext, upload?: SelectUpload): void => {
  if (upload) {
    ForbiddenError.from(ctx.ability).throwUnlessCan('update', toSubject('Upload', upload));
    return;
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Upload');
};

const assertUploadDeleteAccess = (ctx: ServiceContext, upload?: SelectUpload): void => {
  if (upload) {
    ForbiddenError.from(ctx.ability).throwUnlessCan('delete', toSubject('Upload', upload));
    return;
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'Upload');
};

const requireAuthenticatedUser = (ctx: ServiceContext): Result<never> | null => {
  if (!ctx.userId) {
    return unauthorized('Authentication required');
  }

  return null;
};

const requireOrganizationContext = (ctx: ServiceContext): Result<never> | null => {
  if (!ctx.organizationId) {
    return badRequest('Organization context required');
  }

  return null;
};

const isOwnProfileUpload = (upload: SelectUpload, ctx: ServiceContext): boolean =>
  upload.upload_context === 'profile' && upload.user_id === ctx.userId;

const ensureUploadAccess = (
  upload: SelectUpload,
  ctx: ServiceContext,
  action: 'read' | 'update' | 'delete'
): Result<never> | null => {
  try {
    if (action === 'read') {
      assertUploadReadAccess(ctx, upload);
    } else if (action === 'update') {
      assertUploadUpdateAccess(ctx, upload);
    } else {
      assertUploadDeleteAccess(ctx, upload);
    }
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return forbidden('Access denied');
    }

    throw error;
  }

  if (isOwnProfileUpload(upload, ctx)) {
    return null;
  }

  if (!ctx.organizationId || upload.organization_id !== ctx.organizationId) {
    return forbidden('Access denied');
  }

  return null;
};

const sanitizeFileName = (fileName: string): string =>
  fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\./, '_')
    .substring(0, 255);

const generateStorageKey = (params: {
  organizationId?: string | null;
  userId?: string;
  uploadContext: UploadContext;
  uploadId: string;
  fileName: string;
  matterId?: string;
  entityId?: string;
  subContext?: SubContext;
}): Result<string> => {
  const sanitizedFileName = sanitizeFileName(params.fileName);

  if (params.uploadContext === 'profile') {
    if (!params.userId) {
      return badRequest('User ID required for profile uploads');
    }

    return ok(`users/${params.userId}/profile/${params.uploadId}_${sanitizedFileName}`);
  }

  if (!params.organizationId) {
    return badRequest('Organization ID required for non-profile uploads');
  }

  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  switch (params.uploadContext) {
    case 'matter': {
      if (!params.matterId) {
        return badRequest('Matter ID required for matter uploads');
      }

      const subFolder = params.subContext ?? 'documents';
      return ok(
        `orgs/${params.organizationId}/matters/${params.matterId}/${subFolder}/${params.uploadId}_${sanitizedFileName}`
      );
    }
    case 'intake':
      if (!params.entityId) {
        return badRequest('Entity ID (intake ID) required for intake uploads');
      }

      return ok(`orgs/${params.organizationId}/intakes/${params.entityId}/${params.uploadId}_${sanitizedFileName}`);
    case 'trust':
      return ok(
        `orgs/${params.organizationId}/trust-accounting/${year}/${month}/${params.uploadId}_${sanitizedFileName}`
      );
    case 'asset':
      return ok(`orgs/${params.organizationId}/firm-assets/${params.uploadId}_${sanitizedFileName}`);
    default:
      return ok(`orgs/${params.organizationId}/misc/${params.uploadId}_${sanitizedFileName}`);
  }
};

const calculateRetentionUntil = (uploadContext: UploadContext): Date | null => {
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

const isUploadContext = (value: string): value is UploadContext =>
  uploadContexts.some((uploadContext) => uploadContext === value);

const isAuditAction = (value: string): value is AuditAction =>
  auditActions.some((auditAction) => auditAction === value);

const isStorageProvider = (value: string): value is StorageProvider =>
  storageProviders.some((storageProvider) => storageProvider === value);

const isUploadStatus = (value: string | null): value is UploadStatus =>
  uploadStatuses.some((uploadStatus) => uploadStatus === value);

const isMetadataRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toUploadContext = (value: string): UploadContext => {
  if (!isUploadContext(value)) {
    throw new Error(`Unsupported upload context: ${value}`);
  }

  return value;
};

const toAuditAction = (value: string): AuditAction => {
  if (!isAuditAction(value)) {
    throw new Error(`Unsupported upload audit action: ${value}`);
  }

  return value;
};

const toStorageProvider = (value: string): StorageProvider => {
  if (!isStorageProvider(value)) {
    throw new Error(`Unsupported upload storage provider: ${value}`);
  }

  return value;
};

const toUploadStatus = (value: string | null): UploadStatus => {
  if (!isUploadStatus(value)) {
    throw new Error(`Unsupported upload status: ${value}`);
  }

  return value;
};

const mapUploadDetails = (upload: SelectUpload): UploadDetails => ({
  upload_id: upload.id,
  file_name: upload.file_name,
  file_type: upload.file_type,
  file_size: upload.file_size,
  mime_type: upload.mime_type,
  storage_provider: toStorageProvider(upload.storage_provider),
  storage_key: upload.storage_key ?? '',
  public_url: upload.public_url,
  upload_context: toUploadContext(upload.upload_context),
  matter_id: upload.matter_id,
  entity_id: upload.entity_id,
  status: toUploadStatus(upload.status),
  is_privileged: upload.is_privileged ?? true,
  retention_until: upload.retention_until ?? null,
  created_at: upload.created_at,
  verified_at: upload.verified_at ?? null,
  uploaded_by: upload.uploaded_by,
});

const mapAuditLogEntry = (log: SelectUploadAuditLog): AuditLogEntry => ({
  id: log.id,
  upload_id: log.upload_id,
  action: toAuditAction(log.action),
  user_id: log.user_id,
  // User_name is not loaded by the current audit-log query and is intentionally omitted.
  user_name: null,
  ip_address: log.ip_address,
  user_agent: log.user_agent,
  metadata: isMetadataRecord(log.metadata) ? log.metadata : null,
  created_at: log.created_at,
});

export const uploadsSharedService = {
  assertUploadCreateAccess,
  assertUploadDeleteAccess,
  assertUploadReadAccess,
  assertUploadUpdateAccess,
  calculateRetentionUntil,
  ensureUploadAccess,
  generateStorageKey,
  mapAuditLogEntry,
  mapUploadDetails,
  requireAuthenticatedUser,
  requireOrganizationContext,
  sanitizeFileName,
};
