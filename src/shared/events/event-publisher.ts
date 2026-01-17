import { getAppEnv } from '@/shared/utils/env';
import { eventBus } from './event-consumer';
import type { EventType } from '@/shared/events/enums/event-types';
import type {
  BaseEvent,
  EventMetadata,
} from '@/shared/events/schemas/events.schema';
import { db } from '@/shared/database';
import { events } from '@/shared/events/schemas/events.schema';

export const publishEvent = (
  event: Omit<BaseEvent, 'eventId' | 'timestamp'>,
): BaseEvent => {
  const fullEvent: BaseEvent = {
    ...event,
    eventId: crypto.randomUUID(),
    timestamp: new Date(),
  };

  // Persist the event regardless of listeners (fire-and-forget).
  // This makes events observable even when no in-memory handlers are registered.
  void db.insert(events).values({
    eventId: fullEvent.eventId,
    eventType: fullEvent.eventType,
    eventVersion: fullEvent.eventVersion,
    actorId: fullEvent.actorId,
    actorType: fullEvent.actorType,
    organizationId: fullEvent.organizationId,
    payload: fullEvent.payload,
    metadata: fullEvent.metadata,
    processed: false,
    retryCount: 0,
  }).catch((error: unknown) => {
    console.error(`Failed to save event ${fullEvent.eventId} to database:`, error);
  });

  // Emit to in-memory event bus for immediate processing
  // Handlers will save to database if needed
  eventBus.emit(fullEvent.eventType, fullEvent);

  return fullEvent;
};

// Helper function to create event metadata from request context
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

// Helper function for common practice events
export const publishPracticeEvent = (
  eventType: EventType,
  actorId: string,
  organizationId: string,
  payload: Record<string, unknown>,
  requestHeaders?: Record<string, string>,
): BaseEvent => {
  return publishEvent({
    eventType,
    eventVersion: '1.0.0',
    actorId: actorId,
    actorType: 'user',
    organizationId,
    payload,
    metadata: createEventMetadata('api', {
      headers: requestHeaders,
    }),
  });
};

// Helper function for user events
export const publishUserEvent = (
  eventType: EventType,
  actorId: string,
  payload: Record<string, unknown>,
  requestHeaders?: Record<string, string>,
): BaseEvent => {
  return publishEvent({
    eventType,
    eventVersion: '1.0.0',
    actorId: actorId,
    actorType: 'user',
    payload,
    metadata: createEventMetadata('api', {
      headers: requestHeaders,
    }),
  });
};

// Helper function for system events
export const publishSystemEvent = (
  eventType: EventType,
  payload: Record<string, unknown>,
  actorId?: string,
  actorType: string = 'system',
  organizationId?: string,
): BaseEvent => {
  return publishEvent({
    eventType,
    eventVersion: '1.0.0',
    actorId,
    actorType,
    organizationId,
    payload,
    metadata: createEventMetadata('system'),
  });
};

// Super simple helper for common events across modules.
// NOTE: actorType must be 'user' | 'organization' | 'system'
export const publishSimpleEvent = (
  eventType: EventType,
  actorType: 'user' | 'organization' | 'system',
  organizationId: string | undefined,
  payload: Record<string, unknown>,
): BaseEvent => {
  // Infer actorId: for organization use organizationId, for user/system use payload.actor_id
  const inferredActorId: string | undefined = actorType === 'organization'
    ? organizationId
    : (typeof payload.actor_id === 'string' ? payload.actor_id : undefined);
  // Only set timestamp if not already present in payload
  const payloadWithTimestamp = payload.timestamp
    ? payload
    : { ...payload, timestamp: new Date().toISOString() };
  return publishEvent({
    eventType,
    eventVersion: '1.0.0',
    actorId: inferredActorId,
    actorType,
    organizationId,
    payload: payloadWithTimestamp,
    metadata: createEventMetadata(actorType === 'system' ? 'system' : 'api'),
  });
};
