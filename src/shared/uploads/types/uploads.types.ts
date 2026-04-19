import type { z } from 'zod';
import type { uploadValidations } from '@/shared/uploads/types/uploads.validation';

export type UploadScopeType = z.infer<typeof uploadValidations.uploadScopeTypeSchema>;
export type UploadStatus = z.infer<typeof uploadValidations.uploadStatusSchema>;
export type AuditAction = z.infer<typeof uploadValidations.uploadAuditActionSchema>;

export type PresignUploadRequest = z.infer<typeof uploadValidations.presignUploadSchema>;
export type UploadIdParam = z.infer<typeof uploadValidations.uploadIdParamSchema>;
export type DeleteUploadRequest = z.infer<typeof uploadValidations.deleteUploadSchema>;
export type ListUploadsQuery = z.infer<typeof uploadValidations.listUploadsQuerySchema>;

export type PresignUploadResponse = z.infer<typeof uploadValidations.presignUploadResponseSchema>;
export type ConfirmUploadResponse = z.infer<typeof uploadValidations.confirmUploadResponseSchema>;
export type UploadDetails = z.infer<typeof uploadValidations.uploadDetailsResponseSchema>;
export type DownloadUrlResponse = z.infer<typeof uploadValidations.downloadUrlResponseSchema>;
export type ListUploadsResponse = z.infer<typeof uploadValidations.listUploadsResponseSchema>;
export type AuditLogEntry = z.infer<typeof uploadValidations.auditLogEntrySchema>;
export type AuditLogResponse = z.infer<typeof uploadValidations.auditLogResponseSchema>;
