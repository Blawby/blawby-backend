import { z } from 'zod';

// Upload context enum
const uploadContextSchema = z.enum(['matter', 'intake', 'trust', 'profile', 'asset']);

// Sub context for matter uploads
const subContextSchema = z.enum(['documents', 'correspondence', 'evidence']).optional();

// Presign upload request schema
const presignUploadSchema = z.object({
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
const uploadIdParamSchema = z.object({
  id: z.uuid(),
});

// Delete upload request schema
const deleteUploadSchema = z.object({
  reason: z.string().min(1).max(255),
});

// List uploads query schema
const listUploadsQuerySchema = z.object({
  matter_id: z.uuid().optional(),
  upload_context: uploadContextSchema.optional(),
  entity_id: z.uuid().optional(),
  status: z.enum(['pending', 'verified', 'rejected']).optional(),
  include_deleted: z.boolean().optional().default(false),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// Response schemas
const presignUploadResponseSchema = z.object({
  upload_id: z.uuid(),
  presigned_url: z.url(),
  method: z.string(),
  storage_key: z.string(),
  expires_at: z.date(),
});

const confirmUploadResponseSchema = z.object({
  upload_id: z.uuid(),
  public_url: z.url().nullable(),
  storage_key: z.string(),
  status: z.enum(['pending', 'verified', 'rejected']),
});

const uploadDetailsResponseSchema = z.object({
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
  retention_until: z.date().nullable(),
  created_at: z.date(),
  verified_at: z.date().nullable(),
  uploaded_by: z.uuid().nullable(),
});

const downloadUrlResponseSchema = z.object({
  download_url: z.url(),
  expires_at: z.date().nullable(),
});

const listUploadsResponseSchema = z.object({
  uploads: z.array(uploadDetailsResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

const auditLogEntrySchema = z.object({
  id: z.uuid(),
  upload_id: z.uuid(),
  action: z.enum(['created', 'viewed', 'downloaded', 'deleted', 'restored', 'confirmed']),
  user_id: z.uuid().nullable(),
  user_name: z.string().nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.date(),
});

const auditLogResponseSchema = z.object({
  audit_logs: z.array(auditLogEntrySchema),
  total: z.number(),
});

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z
    .array(
      z.object({
        field: z.string(),
        message: z.string(),
        code: z.string(),
      })
    )
    .optional(),
});

const notFoundResponseSchema = z.object({
  error: z.string(),
});

const internalServerErrorResponseSchema = z.object({
  error: z.string(),
});

export const uploadValidations = {
  presignUploadSchema,
  uploadIdParamSchema,
  deleteUploadSchema,
  listUploadsQuerySchema,
  presignUploadResponseSchema,
  confirmUploadResponseSchema,
  uploadDetailsResponseSchema,
  downloadUrlResponseSchema,
  listUploadsResponseSchema,
  auditLogEntrySchema,
  auditLogResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
  uploadContextSchema,
  subContextSchema,
};
