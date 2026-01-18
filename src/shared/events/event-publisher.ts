import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getAppEnv } from '@/shared/utils/env';
import { db } from '@/shared/database';
import type { EventType } from '@/shared/events/enums/event-types';
import type {
  BaseEvent,
  EventMetadata,
} from '@/shared/events/schemas/events.schema';
import { events } from './schemas/events.schema';
import {
  SYSTEM_ACTOR_UUID,
  WEBHOOK_ACTOR_UUID,
  CRON_ACTOR_UUID,
  API_ACTOR_UUID,
  ORGANIZATION_ACTOR_UUID,
} from './constants';

export {
  SYSTEM_ACTOR_UUID,
  WEBHOOK_ACTOR_UUID,
  CRON_ACTOR_UUID,
  API_ACTOR_UUID,
  ORGANIZATION_ACTOR_UUID,
};


export const createEventMetadata = (
  source: string,
  request?: {
    headers?: Record<string, string>;
    ip?: string;
    id?: string;
  },
): EventMetadata => {
  return {
    ipAddress: request?.ip,
    userAgent: request?.headers?.['user-agent'],
    requestId: request?.id,
    source,
    environment: getAppEnv(),
  };
};

/**
 * Publish practice event (non-transactional)
 * Convenience wrapper that saves to DB and emits to event bus
 */
export const publishPracticeEvent = async (
  eventType: EventType,
  actorId: string,
  organizationId: string,
  payload: Record<string, unknown>,
  requestHeaders?: Record<string, string>,
): Promise<void> => {
  try {
    const eventId = crypto.randomUUID();
    const timestamp = new Date();
    const eventMetadata = createEventMetadata('api', {
      headers: requestHeaders,
    });

    const baseEvent = createBaseEvent(
      eventId,
      eventType,
      '1.0.0',
      actorId,
      'user',
      organizationId,
      payload,
      eventMetadata,
      timestamp,
    );

    await insertEventToOutbox(baseEvent);
  } catch (error) {
    console.error(`Failed to publish ${eventType} event:`, error);
  }
};

/**
 * Publish user event (non-transactional)
 * Convenience wrapper that saves to DB and emits to event bus
 */
export const publishUserEvent = async (
  eventType: EventType,
  actorId: string,
  payload: Record<string, unknown>,
  requestHeaders?: Record<string, string>,
): Promise<void> => {
  try {
    const eventId = crypto.randomUUID();
    const timestamp = new Date();
    const eventMetadata = createEventMetadata('api', {
      headers: requestHeaders,
    });

    const baseEvent = createBaseEvent(
      eventId,
      eventType,
      '1.0.0',
      actorId,
      'user',
      undefined,
      payload,
      eventMetadata,
      timestamp,
    );

    await insertEventToOutbox(baseEvent);
  } catch (error) {
    console.error(`Failed to publish ${eventType} event:`, error);
  }
};

/**
 * Publish system event (non-transactional)
 * Convenience wrapper that saves to DB and emits to event bus
 */
export const publishSystemEvent = async (
  eventType: EventType,
  payload: Record<string, unknown>,
  actorId?: string,
  actorType: 'system' | 'webhook' | 'cron' | 'api' = 'system',
  organizationId?: string,
): Promise<void> => {
  try {
    const eventId = crypto.randomUUID();
    const timestamp = new Date();
    const resolvedActorId = actorId ? resolveActorId(actorId) : SYSTEM_ACTOR_UUID;
    const eventMetadata = createEventMetadata('system');

    const baseEvent = createBaseEvent(
      eventId,
      eventType,
      '1.0.0',
      resolvedActorId,
      actorType,
      organizationId,
      payload,
      eventMetadata,
      timestamp,
    );

    await insertEventToOutbox(baseEvent);
  } catch (error) {
    console.error(`Failed to publish ${eventType} event:`, error);
  }
};

/**
 * Publish event directly to database (non-transactional)
 *
 * Use this when you cannot use a transaction (e.g., Better Auth hooks, error handlers).
 * Events are written directly to the database for guaranteed persistence.
 * Errors are handled internally and logged.
 *
 * After publishing, immediately enqueues the outbox processing task for immediate execution.
 */
export const publishSimpleEvent = async (
  eventType: EventType,
  actorId: string,
  organizationId: string | undefined,
  payload: Record<string, unknown>,
): Promise<void> => {
  try {
    const eventId = crypto.randomUUID();
    const timestamp = new Date();
    const eventPayload = { ...payload, timestamp: timestamp.toISOString() };
    const eventMetadata = createEventMetadata('api');

    const baseEvent = createBaseEvent(
      eventId,
      eventType,
      '1.0.0',
      actorId,
      'user',
      organizationId,
      eventPayload,
      eventMetadata,
      timestamp,
    );

    await insertEventToOutbox(baseEvent);

    // Immediately enqueue outbox processing task for immediate execution
    // This ensures events are processed right away instead of waiting for cron
    try {
      const { getWorkerUtils } = await import('@/shared/queue/graphile-worker.client');
      const { TASK_NAMES } = await import('@/shared/queue/queue.config');
      const workerUtils = await getWorkerUtils();

      // Enqueue the outbox processing task immediately
      // The worker polls every second, so this will be picked up almost instantly
      await workerUtils.addJob(
        TASK_NAMES.PROCESS_OUTBOX_EVENT,
        {},
        {
          jobKey: `process-outbox-${Date.now()}`, // Unique key to allow multiple runs
          maxAttempts: 1, // Don't retry - if it fails, cron will pick it up
        },
      );
    } catch (queueError) {
      // Don't fail event publishing if queueing fails - cron will process it eventually
      console.warn('Failed to enqueue immediate outbox processing, will be processed by cron:', queueError);
    }
  } catch (error) {
    console.error(`Failed to publish ${eventType} event:`, error);
  }
};

const resolveActorId = (actorId: string): string => {
  if (actorId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return actorId;
  }

  switch (actorId) {
    case 'system':
      return SYSTEM_ACTOR_UUID;
    case 'webhook':
      return WEBHOOK_ACTOR_UUID;
    case 'cron':
      return CRON_ACTOR_UUID;
    case 'api':
      return API_ACTOR_UUID;
    case 'organization':
      return ORGANIZATION_ACTOR_UUID;
    default:
      console.warn(`[Event Publisher] Unknown actorId "${actorId}" mapped to SYSTEM_ACTOR_UUID`);
      return SYSTEM_ACTOR_UUID;
  }
};

/**
 * Shared event creation logic
 * Creates BaseEvent from parameters
 */
const createBaseEvent = (
  eventId: string,
  type: string,
  eventVersion: string,
  actorId: string,
  actorType: 'user' | 'system' | 'webhook' | 'cron' | 'api',
  organizationId: string | undefined,
  payload: Record<string, unknown>,
  metadata: EventMetadata,
  timestamp: Date,
): BaseEvent => {
  return {
    eventId,
    type,
    eventVersion,
    timestamp,
    actorId: resolveActorId(actorId),
    actorType,
    organizationId,
    payload,
    metadata,
    processed: false,
    retryCount: 0,
  };
};

/**
 * Shared event insertion logic
 * Inserts BaseEvent into database (outbox pattern)
 * Events are processed by workers via process-outbox-event task
 */
const insertEventToOutbox = async (
  baseEvent: BaseEvent,
): Promise<void> => {
  await db.insert(events).values({
    eventId: baseEvent.eventId,
    type: baseEvent.type,
    eventVersion: baseEvent.eventVersion,
    actorId: baseEvent.actorId,
    actorType: baseEvent.actorType,
    organizationId: baseEvent.organizationId,
    payload: baseEvent.payload,
    metadata: baseEvent.metadata,
    processed: baseEvent.processed,
    retryCount: baseEvent.retryCount,
  });
};

/**
 * Publish event within a database transaction (Transactional Outbox Pattern)
 *
 * This function inserts the event into the events table within the same transaction
 * as the business logic, guaranteeing zero data loss. The event will be processed
 * asynchronously by Graphile Workers polling the events table.
 *
 * @param tx - Drizzle transaction client
 * @param event - Event data (excluding eventId and timestamp which are auto-generated)
 */
export const publishEventTx = async (
  tx: NodePgDatabase<any>,
  event: {
    type: string;
    version?: string;
    actorId: string; // Will be resolved to UUID internally
    actorType: 'user' | 'system' | 'webhook' | 'cron' | 'api';
    organizationId?: string;
    payload: Record<string, unknown>;
    metadata?: EventMetadata;
  },
): Promise<void> => {
  const eventId = crypto.randomUUID();
  const timestamp = new Date();
  const eventMetadata = event.metadata || createEventMetadata('api');

  const baseEvent = createBaseEvent(
    eventId,
    event.type,
    event.version || '1.0.0',
    event.actorId,
    event.actorType,
    event.organizationId,
    event.payload,
    eventMetadata,
    timestamp,
  );

  await tx.insert(events).values({
    eventId: baseEvent.eventId,
    type: baseEvent.type,
    eventVersion: baseEvent.eventVersion,
    actorId: baseEvent.actorId,
    actorType: baseEvent.actorType,
    organizationId: baseEvent.organizationId,
    payload: baseEvent.payload,
    metadata: baseEvent.metadata,
    processed: baseEvent.processed,
    retryCount: baseEvent.retryCount,
  });
};
