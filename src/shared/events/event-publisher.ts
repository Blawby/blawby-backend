import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getAppEnv } from '@/shared/utils/env';
import { db } from '@/shared/database';
import { eventBus } from './event-consumer';
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

export const publishEvent = (
  event: Omit<BaseEvent, 'eventId' | 'timestamp'>,
): BaseEvent => {
  const fullEvent: BaseEvent = {
    ...event,
    eventId: crypto.randomUUID(),
    timestamp: new Date(),
  };

  eventBus.emit(fullEvent.type, fullEvent);

  return fullEvent;
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

export const publishPracticeEvent = (
  eventType: EventType,
  actorId: string,
  organizationId: string,
  payload: Record<string, unknown>,
  requestHeaders?: Record<string, string>,
): BaseEvent => {
  return publishEvent({
    type: eventType,
    eventVersion: '1.0.0',
    actorId: resolveActorId(actorId),
    actorType: 'user',
    organizationId,
    payload,
    metadata: createEventMetadata('api', {
      headers: requestHeaders,
    }),
  });
};

export const publishUserEvent = (
  eventType: EventType,
  actorId: string,
  payload: Record<string, unknown>,
  requestHeaders?: Record<string, string>,
): BaseEvent => {
  return publishEvent({
    type: eventType,
    eventVersion: '1.0.0',
    actorId: resolveActorId(actorId),
    actorType: 'user',
    payload,
    metadata: createEventMetadata('api', {
      headers: requestHeaders,
    }),
  });
};

export const publishSystemEvent = (
  eventType: EventType,
  payload: Record<string, unknown>,
  actorId?: string,
  actorType: 'system' | 'webhook' | 'cron' | 'api' = 'system',
  organizationId?: string,
): BaseEvent => {
  return publishEvent({
    type: eventType,
    eventVersion: '1.0.0',
    actorId: actorId ? resolveActorId(actorId) : SYSTEM_ACTOR_UUID,
    actorType,
    organizationId,
    payload,
    metadata: createEventMetadata('system'),
  });
};

/**
 * Publish event directly to database (non-transactional)
 *
 * Use this when you cannot use a transaction (e.g., Better Auth hooks, error handlers).
 * Events are written directly to the database for guaranteed persistence.
 * Errors are handled internally and logged.
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
    const resolvedActorId = resolveActorId(actorId);
    const eventPayload = { ...payload, timestamp: timestamp.toISOString() };
    const eventMetadata = createEventMetadata('api');

    await db.insert(events).values({
      eventId,
      type: eventType,
      eventVersion: '1.0.0',
      actorId: resolvedActorId,
      actorType: 'user',
      organizationId,
      payload: eventPayload,
      metadata: eventMetadata,
      processed: false,
      retryCount: 0,
    });

    eventBus.emit(eventType, {
      eventId,
      type: eventType,
      eventVersion: '1.0.0',
      timestamp,
      actorId: resolvedActorId,
      actorType: 'user',
      organizationId,
      payload: eventPayload,
      metadata: eventMetadata,
    });
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

  await tx.insert(events).values({
    eventId,
    type: event.type,
    eventVersion: event.version || '1.0.0',
    actorId: resolveActorId(event.actorId),
    actorType: event.actorType,
    organizationId: event.organizationId,
    payload: event.payload,
    metadata: event.metadata || createEventMetadata('api'),
    processed: false,
    retryCount: 0,
  });
};
