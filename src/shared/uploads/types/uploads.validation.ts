import { z } from '@hono/zod-openapi';

const uploadScopeTypeSchema = z.enum(['matter', 'intake', 'conversation', 'profile']);
const uploadStatusSchema = z.enum(['pending', 'verified', 'rejected']);
const uploadAuditActionSchema = z.enum(['created', 'viewed', 'downloaded', 'deleted', 'restored', 'confirmed']);

const presignUploadSchema = z.object({
  file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(100),
  file_size: z.number().int().positive().max(52_428_800),
  scope_type: uploadScopeTypeSchema.optional(),
  scope_id: z.uuid().optional(),
  is_privileged: z.boolean().optional().default(true),
});

const uploadIdParamSchema = z.object({
  id: z.uuid(),
});

const deleteUploadSchema = z.object({
  reason: z.string().min(1).max(255),
});

const listUploadsQuerySchema = z.object({
  scope_type: uploadScopeTypeSchema.optional(),
  scope_id: z.uuid().optional(),
  status: uploadStatusSchema.optional(),
  include_deleted: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .optional()
    .default(false),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const presignUploadResponseSchema = z.object({
  upload_id: z.uuid(),
  presigned_url: z.url(),
  method: z.enum(['PUT', 'POST']),
  storage_key: z.string(),
  expires_at: z.date(),
});

const confirmUploadResponseSchema = z.object({
  upload_id: z.uuid(),
  public_url: z.string().nullable(),
  storage_key: z.string(),
  status: uploadStatusSchema,
});

const uploadDetailsResponseSchema = z.object({
  upload_id: z.uuid(),
  file_name: z.string(),
  file_type: z.string(),
  file_size: z.number(),
  mime_type: z.string(),
  storage_provider: z.enum(['r2', 'images']),
  storage_key: z.string(),
  public_url: z.string().nullable(),
  scope_type: uploadScopeTypeSchema.nullable(),
  scope_id: z.uuid().nullable(),
  status: uploadStatusSchema,
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
  action: uploadAuditActionSchema,
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

export const uploadValidations = {
  uploadScopeTypeSchema,
  uploadStatusSchema,
  uploadAuditActionSchema,
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
};
