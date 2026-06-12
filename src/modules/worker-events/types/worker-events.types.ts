import { z } from '@hono/zod-openapi';
import type { workerEventsValidation } from '@/modules/worker-events/validations/worker-events.validation';

export type WorkerEventPayload = z.infer<typeof workerEventsValidation.payloadSchema>;
export type WorkerEventResponse = z.infer<typeof workerEventsValidation.responseSchema>;

export const conversationCreatedEventSchema = z.object({
  type: z.literal('conversation.created'),
  id: z.uuid(),
  organization_id: z.uuid(),
  client_user_id: z.uuid(),
  is_anonymous: z.boolean(),
  status: z.enum(['draft', 'active', 'submitted', 'closed', 'archived']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  created_at: z.string(),
});

export const messageCompletedEventSchema = z.object({
  type: z.literal('message.completed'),
  id: z.uuid(),
  conversation_id: z.uuid(),
  organization_id: z.uuid(),
  user_id: z.uuid().nullable(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  seq: z.number().int(),
  client_id: z.string(),
  token_count: z.number().int().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});

export const conversationStatusChangedEventSchema = z.object({
  type: z.literal('conversation.status_changed'),
  id: z.uuid(),
  organization_id: z.uuid(),
  status: z.enum(['draft', 'active', 'submitted', 'closed', 'archived']),
  intake_mode_activated_at: z.string().nullable(),
  ai_failed_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  updated_at: z.string(),
});

export const conversationMatterLinkedEventSchema = z.object({
  type: z.literal('conversation.matter_linked'),
  id: z.uuid(),
  organization_id: z.uuid(),
  matter_id: z.uuid().nullable(),
  updated_at: z.string(),
});

export const intakeConversationEventSchema = z.discriminatedUnion('type', [
  conversationCreatedEventSchema,
  messageCompletedEventSchema,
  conversationStatusChangedEventSchema,
  conversationMatterLinkedEventSchema,
]);

export const intakeConversationEventsPayloadSchema = z.object({
  events: z.array(intakeConversationEventSchema),
});

export type IntakeConversationEvent = z.infer<typeof intakeConversationEventSchema>;
export type IntakeConversationEventsPayload = z.infer<typeof intakeConversationEventsPayloadSchema>;
