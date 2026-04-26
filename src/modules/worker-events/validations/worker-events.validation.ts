import { z } from '@hono/zod-openapi';

/**
 * Canonical worker event payload schema.
 *
 * This is the contract for external workers (chatbot, etc.) to dispatch
 * events into the backend's event/listener pipeline.
 */
const payloadSchema = z
  .object({
    event_type: z.string().min(1).max(255).openapi({
      description: 'Dot-notation event type (e.g. "conversation.message_received")',
      example: 'conversation.message_received',
    }),
    event_id: z.uuid().openapi({
      description: 'Unique event identifier (idempotency key)',
    }),
    occurred_at: z.iso.datetime({ offset: true }).openapi({
      description: 'When the event occurred (ISO 8601)',
      example: '2026-03-28T12:00:00Z',
    }),
    practice_id: z.uuid().openapi({
      description: 'Organization / practice ID',
    }),
    entity_type: z.string().min(1).max(100).openapi({
      description: 'Type of entity this event relates to',
      example: 'conversation',
    }),
    entity_id: z.uuid().openapi({
      description: 'ID of the entity this event relates to',
    }),
    actor_type: z.enum(['user', 'system', 'worker', 'bot']).openapi({
      description: 'Type of actor that triggered the event',
    }),
    actor_id: z.string().min(1).max(255).openapi({
      description: 'ID of the actor',
    }),
    contact_id: z.uuid().optional().openapi({
      description: 'Contact/client ID if applicable',
    }),
    recipient_email: z.email().optional().openapi({
      description: 'Explicit recipient email when backend cannot resolve from entity',
    }),
    metadata: z.record(z.string(), z.unknown()).optional().openapi({
      description: 'Additional template-variable data for email rendering',
    }),
  })
  .openapi('WorkerEventPayload');

/**
 * Response schema for the ingest endpoint
 */
const responseSchema = z
  .object({
    success: z.boolean(),
    event_id: z.uuid(),
    status: z.enum(['accepted', 'duplicate']),
  })
  .openapi('WorkerEventResponse');

export const workerEventsValidation = {
  payloadSchema,
  responseSchema,
};
