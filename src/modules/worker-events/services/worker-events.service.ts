/**
 * Worker Events Service
 *
 * Ingests external worker events into the backend event pipeline.
 * Supports idempotency via event_id deduplication.
 */

import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { WorkerEventPayload, WorkerEventResponse } from '@/modules/worker-events/types/worker-events.types';
import { db } from '@/shared/database';
import { config } from '@/shared/config';
import { events } from '@/shared/events/schemas/events.schema';

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
 */
export const validateWorkerSecret = (headerValue: string | undefined): void => {
  const { secret } = config.workerEvents;

  if (!secret) {
    throw new HTTPException(503, { message: 'Worker event ingestion is not configured' });
  }

  if (!headerValue || headerValue !== secret) {
    throw new HTTPException(401, { message: 'Invalid worker event secret' });
  }
};

/**
 * Ingest a worker event into the backend event pipeline.
 * Returns 'duplicate' status if the event_id has already been processed.
 */
export const ingestWorkerEvent = async (payload: WorkerEventPayload): Promise<WorkerEventResponse> => {
  // Idempotency check: look for existing event with the same event_id
  const existing = await db.select({ eventId: events.eventId }).from(events).where(eq(events.eventId, payload.event_id)).limit(1);

  if (existing.length > 0) {
    logger.info('Duplicate worker event skipped: {eventId}', { eventId: payload.event_id });
    return {
      success: true,
      event_id: payload.event_id,
      status: 'duplicate',
    };
  }

  // Insert into the events outbox table for processing by the event worker
  await db.insert(events).values({
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
      ...(payload.metadata ?? {}),
    },
    metadata: {
      source: 'worker-event-ingestion',
      environment: config.env.app,
    },
    processed: false,
    retryCount: 0,
  });

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
