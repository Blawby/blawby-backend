import { eventBus } from './event-consumer';
import type { EventType } from '@/shared/events/enums/event-types';
import type {
  BaseEvent,
  EventMetadata,
} from '@/shared/events/schemas/events.schema';

export const publishEvent = (
  event: Omit<BaseEvent, 'eventId' | 'timestamp'>,
): BaseEvent => {
  const fullEvent: BaseEvent = {
    ...event,
    eventId: crypto.randomUUID(),
    timestamp: new Date(),
  };

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
    environment: process.env.NODE_ENV || 'development',
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

// Super simple one-liner for any event
export const publishSimpleEvent = (
  eventType: EventType,
  actorId: string,
  organizationId: string | undefined,
  payload: Record<string, unknown>,
): BaseEvent => publishUserEvent(eventType, actorId, { ...payload, timestamp: new Date().toISOString() });
