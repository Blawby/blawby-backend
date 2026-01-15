import { z } from 'zod';

// Upload context enum
export const uploadContextSchema = z.enum(['matter', 'intake', 'trust', 'profile', 'asset']);

// Sub context for matter uploads
export const subContextSchema = z.enum(['documents', 'correspondence', 'evidence']).optional();

// Presign upload request schema
export const presignUploadSchema = z.object({
  file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(100),
  file_size: z.number().int().min(1).max(52428800), // Max 50MB
  upload_context: uploadContextSchema,
  matter_id: z.uuid().optional(),
  entity_id: z.uuid().optional(),
  sub_context: subContextSchema,
  is_privileged: z.boolean().optional().default(true),
});

// UUID param schema
export const uploadIdParamSchema = z.object({
  id: z.uuid(),
});

// Delete upload request schema
export const deleteUploadSchema = z.object({
  reason: z.string().min(1).max(255),
});

// List uploads query schema
export const listUploadsQuerySchema = z.object({
  matter_id: z.uuid().optional(),
  upload_context: uploadContextSchema.optional(),
  entity_id: z.uuid().optional(),
  status: z.enum(['pending', 'verified', 'rejected']).optional(),
  include_deleted: z.boolean().optional().default(false),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// Response schemas
export const presignUploadResponseSchema = z.object({
  upload_id: z.uuid(),
  presigned_url: z.url(),
  method: z.string(),
  storage_key: z.string(),
  expires_at: z.iso.datetime(),
});

export const confirmUploadResponseSchema = z.object({
  upload_id: z.uuid(),
  public_url: z.url(),
  storage_key: z.string(),
  status: z.enum(['pending', 'verified', 'rejected']),
});

export const uploadDetailsResponseSchema = z.object({
  upload_id: z.uuid(),
  file_name: z.string(),
  file_type: z.string(),
  file_size: z.number(),
  mime_type: z.string(),
  storage_provider: z.enum(['r2', 'images']),
  storage_key: z.string(),
  public_url: z.url().nullable(),
  upload_context: uploadContextSchema,
  matter_id: z.uuid().nullable(),
  entity_id: z.uuid().nullable(),
  status: z.enum(['pending', 'verified', 'rejected']),
  is_privileged: z.boolean(),
  retention_until: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  verified_at: z.iso.datetime().nullable(),
  uploaded_by: z.uuid().nullable(),
});

export const downloadUrlResponseSchema = z.object({
  download_url: z.url(),
  expires_at: z.iso.datetime().nullable(),
});

export const listUploadsResponseSchema = z.object({
  uploads: z.array(uploadDetailsResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const auditLogEntrySchema = z.object({
  id: z.uuid(),
  upload_id: z.uuid(),
  action: z.enum(['created', 'viewed', 'downloaded', 'deleted', 'restored']),
  user_id: z.uuid().nullable(),
  user_name: z.string().nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.iso.datetime(),
});

export const auditLogResponseSchema = z.object({
  audit_logs: z.array(auditLogEntrySchema),
  total: z.number(),
});

export const errorResponseSchema = z.object({
  error: z.string(),
});

export const notFoundResponseSchema = z.object({
  error: z.string(),
});

export const internalServerErrorResponseSchema = z.object({
  error: z.string(),
});

// Type exports
export type PresignUploadRequest = z.infer<typeof presignUploadSchema>;
export type UploadIdParam = z.infer<typeof uploadIdParamSchema>;
export type DeleteUploadRequest = z.infer<typeof deleteUploadSchema>;
export type ListUploadsQuery = z.infer<typeof listUploadsQuerySchema>;
