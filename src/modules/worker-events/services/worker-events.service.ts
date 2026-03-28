/**
 * Worker Events Service
 *
 * Ingests external worker events into the backend event pipeline.
 * Supports idempotency via event_id deduplication.
 */

import { timingSafeEqual } from 'node:crypto';
import { getLogger } from '@logtape/logtape';
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

export const workerEventsService = {
  validateWorkerSecret,
  ingestWorkerEvent,
};
