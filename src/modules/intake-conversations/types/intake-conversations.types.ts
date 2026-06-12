import { z } from '@hono/zod-openapi';

export const intakeConversationStatusSchema = z.enum(['draft', 'active', 'submitted', 'closed', 'archived']);
export const intakeConversationLifecycleStatusSchema = z.enum(['pending_visibility', 'visible', 'archived']);
export const intakeConversationPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);

export const intakeConversationResponseSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  client_user_id: z.uuid(),
  is_anonymous: z.boolean(),
  matter_id: z.uuid().nullable(),
  status: intakeConversationStatusSchema,
  lifecycle_status: intakeConversationLifecycleStatusSchema,
  assigned_to_user_id: z.uuid().nullable(),
  priority: intakeConversationPrioritySchema,
  tags: z.array(z.string()).nullable(),
  internal_notes: z.string().nullable(),
  last_message_at: z.string().nullable(),
  last_message_content: z.string().nullable(),
  latest_seq: z.number().int(),
  intake_mode_activated_at: z.string().nullable(),
  ai_failed_at: z.string().nullable(),
  first_response_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const intakeConversationMessageResponseSchema = z.object({
  id: z.uuid(),
  conversation_id: z.uuid(),
  organization_id: z.uuid(),
  user_id: z.uuid().nullable(),
  role: messageRoleSchema,
  content: z.string(),
  reply_to_message_id: z.uuid().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  seq: z.number().int(),
  client_id: z.string(),
  token_count: z.number().int().nullable(),
  created_at: z.string(),
});

export const updateIntakeConversationSchema = z.object({
  status: intakeConversationStatusSchema.optional(),
  assigned_to_user_id: z.uuid().nullable().optional(),
  priority: intakeConversationPrioritySchema.optional(),
  tags: z.array(z.string()).nullable().optional(),
  internal_notes: z.string().nullable().optional(),
  matter_id: z.uuid().nullable().optional(),
});

export const listIntakeConversationsQuerySchema = z.object({
  practice_id: z.uuid(),
  status: intakeConversationStatusSchema.optional(),
  lifecycle_status: intakeConversationLifecycleStatusSchema.optional(),
  assigned_to_user_id: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const listMessagesQuerySchema = z.object({
  from_seq: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type IntakeConversationResponse = z.infer<typeof intakeConversationResponseSchema>;
export type IntakeConversationMessageResponse = z.infer<typeof intakeConversationMessageResponseSchema>;
export type UpdateIntakeConversationRequest = z.infer<typeof updateIntakeConversationSchema>;
export type ListIntakeConversationsQuery = z.infer<typeof listIntakeConversationsQuerySchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
