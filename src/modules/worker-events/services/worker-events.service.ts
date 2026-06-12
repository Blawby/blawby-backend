/**
 * Worker Events Service
 *
 * Ingests external worker events into the backend event pipeline.
 * Supports idempotency via event_id deduplication.
 */

import { intakeConversationMessagesQueries } from '@/modules/intake-conversations/database/queries/intake-conversation-messages.queries';
import { intakeConversationsQueries } from '@/modules/intake-conversations/database/queries/intake-conversations.queries';
import type {
  IntakeConversationEvent,
  IntakeConversationEventsPayload,
  WorkerEventPayload,
  WorkerEventResponse,
} from '@/modules/worker-events/types/worker-events.types';
import { config } from '@/shared/config';
import { db } from '@/shared/database';
import { events } from '@/shared/events/schemas/events.schema';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { timingSafeEqual } from 'node:crypto';

const logger = getLogger(['worker-events', 'service']);

/**
 * Resolve actor type for the events table from the worker event payload.
 */
const resolveActorType = (
  actorType: WorkerEventPayload['actor_type']
): 'user' | 'system' | 'webhook' | 'cron' | 'api' | 'organization' => {
  switch (actorType) {
    case 'user':
      return 'user';
    case 'system':
    case 'worker':
    case 'bot':
      return 'system';
    default:
      return 'system';
  }
};

/**
 * Validate the worker event secret from the request header.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 */
const validateWorkerSecret = (headerValue: string | undefined): void => {
  const { secret } = config.workerEvents;

  if (!secret) {
    throw new HTTPException(503, { message: 'Worker event ingestion is not configured' });
  }

  if (!headerValue) {
    throw new HTTPException(401, { message: 'Invalid worker event secret' });
  }

  const expected = Buffer.from(secret);
  const received = Buffer.from(headerValue);

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new HTTPException(401, { message: 'Invalid worker event secret' });
  }
};

/**
 * Ingest a worker event into the backend event pipeline.
 * Uses onConflictDoNothing for atomic idempotency on event_id (primary key).
 * Returns 'duplicate' status if the event_id has already been processed.
 */
const ingestWorkerEvent = async (payload: WorkerEventPayload): Promise<WorkerEventResponse> => {
  const inserted = await db
    .insert(events)
    .values({
      eventId: payload.event_id,
      type: payload.event_type,
      eventVersion: '1.0.0',
      actorId: payload.actor_id,
      actorType: resolveActorType(payload.actor_type),
      organizationId: payload.practice_id,
      payload: {
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
        contact_id: payload.contact_id,
        recipient_email: payload.recipient_email,
        occurred_at: payload.occurred_at,
        metadata: payload.metadata ?? {},
      },
      metadata: {
        source: 'worker-event-ingestion',
        environment: config.env.app,
      },
      processed: false,
      retryCount: 0,
    })
    .onConflictDoNothing({ target: events.eventId })
    .returning({ eventId: events.eventId });

  if (inserted.length === 0) {
    logger.info('Duplicate worker event skipped: {eventId}', { eventId: payload.event_id });
    return {
      success: true,
      event_id: payload.event_id,
      status: 'duplicate',
    };
  }

  logger.info('Worker event ingested: {eventId} ({eventType})', {
    eventId: payload.event_id,
    eventType: payload.event_type,
  });

  return {
    success: true,
    event_id: payload.event_id,
    status: 'accepted',
  };
};

const intakeConversationsLogger = getLogger(['worker-events', 'intake-conversations']);

const processIntakeConversationEvent = async (event: IntakeConversationEvent): Promise<'processed' | 'skipped'> => {
  const { id, organization_id } = event;
  try {
    switch (event.type) {
      case 'conversation.created': {
        const ts = new Date(event.created_at);
        await intakeConversationsQueries.create({
          id,
          organization_id,
          client_user_id: event.client_user_id,
          is_anonymous: event.is_anonymous,
          status: event.status,
          priority: event.priority,
          created_at: ts,
          updated_at: ts,
        });
        return 'processed';
      }
      case 'message.completed': {
        const createdAt = new Date(event.created_at);
        await intakeConversationMessagesQueries.upsert({
          id,
          conversation_id: event.conversation_id,
          organization_id,
          user_id: event.user_id ?? null,
          role: event.role,
          content: event.content,
          seq: event.seq,
          client_id: event.client_id,
          token_count: event.token_count ?? null,
          metadata: event.metadata,
          created_at: createdAt,
        });
        await intakeConversationsQueries.updateLatestSeq(event.conversation_id, event.seq, createdAt, event.content);
        return 'processed';
      }
      case 'conversation.status_changed': {
        // Stale guard: only update if event is newer than current row's updated_at.
        const eventUpdatedAt = new Date(event.updated_at);
        const existing = await intakeConversationsQueries.findById(id);
        if (existing && existing.updated_at >= eventUpdatedAt) {
          return 'skipped';
        }
        await intakeConversationsQueries.update(id, {
          status: event.status,
          intake_mode_activated_at: event.intake_mode_activated_at ? new Date(event.intake_mode_activated_at) : null,
          ai_failed_at: event.ai_failed_at ? new Date(event.ai_failed_at) : null,
          closed_at: event.closed_at ? new Date(event.closed_at) : null,
          updated_at: eventUpdatedAt,
        });
        return 'processed';
      }
      case 'conversation.matter_linked': {
        const eventUpdatedAt = new Date(event.updated_at);
        const existingForLink = await intakeConversationsQueries.findById(id);
        if (existingForLink && existingForLink.updated_at >= eventUpdatedAt) {
          return 'skipped';
        }
        await intakeConversationsQueries.update(id, {
          matter_id: event.matter_id ?? null,
          updated_at: eventUpdatedAt,
        });
        return 'processed';
      }
      default: {
        return 'skipped';
      }
    }
  } catch (err) {
    intakeConversationsLogger.warn('Failed to process intake conversation event {type} {id}: {error}', {
      type: event.type,
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    return 'skipped';
  }
};

const ingestIntakeConversationEvents = async (
  payload: IntakeConversationEventsPayload
): Promise<{ processed: number; skipped: number }> => {
  let processed = 0;
  let skipped = 0;
  for (const event of payload.events) {
    // oxlint-disable-next-line no-await-in-loop -- events must process sequentially (created before message.completed)
    const result = await processIntakeConversationEvent(event);
    if (result === 'processed') {
      processed++;
    } else {
      skipped++;
    }
  }
  return { processed, skipped };
};

export const workerEventsService = {
  validateWorkerSecret,
  ingestWorkerEvent,
  ingestIntakeConversationEvents,
};
