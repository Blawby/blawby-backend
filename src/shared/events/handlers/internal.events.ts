/**
 * Internal Event Registration
 *
 * Laravel-style event registration for internal system events
 * Centralized internal event-to-handler mapping
 */

import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

// Event-to-Handler mapping (like Laravel's $listen)
export const INTERNAL_EVENTS = {

  // System health check
  [EventType.SYSTEM_HEALTH_CHECK_PERFORMED]: {
    handler: async (event: BaseEvent) => {
      console.info('System health check performed', {
        timestamp: event.timestamp,
        status: (event.payload as { status: string }).status,
        checks: (event.payload as { checks: Record<string, unknown> }).checks,
      });
    },
    options: {
      priority: 0,
      shouldQueue: false,
    },
  },

  // System error occurred
  [EventType.SYSTEM_ERROR_OCCURRED]: {
    handler: async (event: BaseEvent) => {
      console.error('System error occurred', {
        timestamp: event.timestamp,
        error: (event.payload as { error: string }).error,
        context: (event.payload as { context?: Record<string, unknown> }).context,
      });

      // Could trigger alerting here
    },
    options: {
      priority: 100, // High priority for errors
      shouldQueue: false,
    },
  },

  // System performance degraded
  [EventType.SYSTEM_PERFORMANCE_DEGRADED]: {
    handler: async (event: BaseEvent) => {
      console.warn('System performance degraded', {
        timestamp: event.timestamp,
        metrics: (event.payload as { metrics: Record<string, unknown> }).metrics,
        threshold: (event.payload as { threshold: Record<string, unknown> }).threshold,
      });

      // Could trigger performance monitoring alerts
    },
    options: {
      priority: 50, // Medium priority for performance issues
      shouldQueue: false,
    },
  },

  // Session created
  [EventType.SESSION_CREATED]: {
    handler: async (event: BaseEvent) => {
      console.info('Session created', {
        userId: event.actorId,
        sessionId: (event.payload as { sessionId: string }).sessionId,
        ipAddress: (event.payload as { ipAddress?: string }).ipAddress,
        userAgent: (event.payload as { userAgent?: string }).userAgent,
      });
    },
    options: {
      priority: 0,
      shouldQueue: false,
    },
  },

  // Session expired
  [EventType.SESSION_EXPIRED]: {
    handler: async (event: BaseEvent) => {
      console.info('Session expired', {
        userId: event.actorId,
        sessionId: (event.payload as { sessionId: string }).sessionId,
        expiredAt: (event.payload as { expiredAt: string }).expiredAt,
      });
    },
    options: {
      priority: 0,
      shouldQueue: false,
    },
  },

  // Session invalidated
  [EventType.SESSION_INVALIDATED]: {
    handler: async (event: BaseEvent) => {
      console.info('Session invalidated', {
        userId: event.actorId,
        sessionId: (event.payload as { sessionId: string }).sessionId,
        reason: (event.payload as { reason: string }).reason,
      });
    },
    options: {
      priority: 0,
      shouldQueue: false,
    },
  },

} as const;

// Register all internal event handlers
export const registerInternalEvents = (): void => {
  console.info('Registering internal event handlers...');

  for (const [eventType, config] of Object.entries(INTERNAL_EVENTS)) {
    subscribeToEvent(eventType, config.handler, config.options);
  }

  console.info(`Registered ${Object.keys(INTERNAL_EVENTS).length} internal handlers`);
};
