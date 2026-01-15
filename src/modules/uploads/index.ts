// Export main components
export { uploads, uploadsRelations } from '@/modules/uploads/database/schema/uploads.schema';
export { uploadAuditLogs, uploadAuditLogsRelations } from '@/modules/uploads/database/schema/upload-audit-logs.schema';
export { uploadsRepository } from '@/modules/uploads/database/queries/uploads.repository';
export { auditLogsRepository } from '@/modules/uploads/database/queries/audit-logs.repository';
export { createUploadsService } from '@/modules/uploads/services/uploads.service';
export * from '@/modules/uploads/types/uploads.types';
export {
  presignUploadSchema,
  uploadIdParamSchema,
  deleteUploadSchema,
  listUploadsQuerySchema,
  type PresignUploadRequest,
  type UploadIdParam,
  type DeleteUploadRequest,
  type ListUploadsQuery,
} from '@/modules/uploads/validations/uploads.validation';
export { default as uploadsApp } from '@/modules/uploads/http';
