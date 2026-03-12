import { z } from 'zod';
import { uploadValidations } from '@/modules/uploads/validations/uploads.validation';

export type UploadContext = z.infer<typeof uploadValidations.uploadContextSchema>;
export type UploadStatus = 'pending' | 'verified' | 'rejected'; // Keep manual as it's used in and out of zod
export type StorageProvider = 'r2' | 'images';
export type AuditAction = 'created' | 'viewed' | 'downloaded' | 'deleted' | 'restored' | 'confirmed';

export type SubContext = z.infer<typeof uploadValidations.subContextSchema>;

// Inferred from Zod schemas
export type PresignUploadRequest = z.infer<typeof uploadValidations.presignUploadSchema>;
export type UploadIdParam = z.infer<typeof uploadValidations.uploadIdParamSchema>;
export type DeleteUploadRequest = z.infer<typeof uploadValidations.deleteUploadSchema>;
export type ListUploadsQuery = z.infer<typeof uploadValidations.listUploadsQuerySchema>;

export type PresignUploadResponse = z.infer<typeof uploadValidations.presignUploadResponseSchema>;
export type ConfirmUploadResponse = z.infer<typeof uploadValidations.confirmUploadResponseSchema>;
export type UploadDetails = z.infer<typeof uploadValidations.uploadDetailsResponseSchema>;
export type ListUploadsResponse = z.infer<typeof uploadValidations.listUploadsResponseSchema>;
export type DownloadUrlResponse = z.infer<typeof uploadValidations.downloadUrlResponseSchema>;
export type AuditLogEntry = z.infer<typeof uploadValidations.auditLogEntrySchema>;
export type AuditLogResponse = z.infer<typeof uploadValidations.auditLogResponseSchema>;