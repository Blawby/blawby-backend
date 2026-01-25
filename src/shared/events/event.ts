/**
 * Event System - Laravel-Inspired Implementation
 *
 * Provides a clean, type-safe API for publishing and subscribing to events.
 *
 * Usage:
 *   Dispatch an event
 *   await UserSignedUp.dispatch({ userId, email });
 *
 *   Dispatch within a transaction
 *   await UserSignedUp.dispatch({ userId, email }, { tx });
 *
 *   Listen to an event
 *   Event.listen(UserSignedUp, async (payload) => { ... });
 */

import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  SYSTEM_ACTOR_UUID,
  WEBHOOK_ACTOR_UUID,
  CRON_ACTOR_UUID,
  API_ACTOR_UUID,
  ORGANIZATION_ACTOR_UUID,
} from './constants';
import { events, type EventMetadata } from './schemas/events.schema';
import { db } from '@/shared/database';
import { TASK_NAMES } from '@/shared/queue/queue.config';
import { getAppEnv } from '@/shared/utils/env';

// Handler function type
type Handler<T> = (payload: T) => Promise<void | boolean>;

// Dispatch options type
type DispatchOptions = {
  actorId?: string;
  actorType?: 'user' | 'system' | 'webhook' | 'cron' | 'api';
  organizationId?: string;
  tx?: NodePgDatabase<any>;
};

// Event class type - infers payload type T from constructor parameter
type EventClass<T extends Record<string, unknown> = Record<string, unknown>> = {
  type: string;
  new(payload: T, actorId?: string, organizationId?: string): BaseEvent<T>;
};

// Global handler registry - populated by Event.listen()
const handlers = new Map<string, Handler<any>[]>();

/**
 * Resolve actor ID string to UUID
 */
const resolveActorId = (actorId: string): string => {
  // If already a UUID, return as-is
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
      console.warn(`[Event] Unknown actorId "${actorId}" mapped to SYSTEM_ACTOR_UUID`);
      return SYSTEM_ACTOR_UUID;
  }
};

/**
 * Create event metadata
 */
const createEventMetadata = (source: string): EventMetadata => ({
  source,
  environment: getAppEnv(),
});

/**
 * Base Event class - all events extend this
 *
 * Each subclass must define a static `type` property with the event type string.
 */
export abstract class BaseEvent<T extends Record<string, unknown>> {
  // Note: `static type` is defined in each subclass, not here

  constructor(
    public readonly payload: T,
    public readonly actorId: string = 'system',
    public readonly organizationId?: string,
  ) { }

  /**
   * Dispatch event - Laravel style static method
   *
   * @param payload - Event-specific payload data
   * @param options - Optional dispatch options
   * @returns Event ID (UUID)
   */
  static async dispatch<T extends Record<string, unknown>>(
    this: { type: string; new(payload: T): BaseEvent<T> },
    payload: T,
    options?: DispatchOptions,
  ): Promise<string> {
    const eventId = crypto.randomUUID();
    const resolvedActorId = resolveActorId(options?.actorId ?? 'system');

    const record = {
      eventId,
      type: this.type,
      eventVersion: '1.0.0',
      actorId: resolvedActorId,
      actorType: options?.actorType ?? 'user',
      organizationId: options?.organizationId,
      payload,
      metadata: createEventMetadata(options?.tx ? 'tx' : 'api'),
      processed: false,
      retryCount: 0,
    };

    if (options?.tx) {
      // Transactional: insert and queue job atomically
      await options.tx.insert(events).values(record);
      await options.tx.execute(sql`
        SELECT graphile_worker.add_job(
          ${TASK_NAMES.PROCESS_OUTBOX_EVENT},
          json_build_object('eventId', ${eventId}::text)::json
        );
      `);
    } else {
      // Non-transactional: insert then queue
      await db.insert(events).values(record);
      const { getWorkerUtils } = await import('@/shared/queue/graphile-worker.client');
      const utils = await getWorkerUtils();
      await utils.addJob(TASK_NAMES.PROCESS_OUTBOX_EVENT, { eventId });
    }

    return eventId;
  }
}

/**
 * Event facade - Laravel style
 *
 * Provides static methods for registering and dispatching event handlers.
 */
export const Event = {
  /**
   * Register a handler for an event type
   *
   * @param eventClass - The event class to listen for
   * @param handler - Handler function to execute when event fires
   */
  listen<T extends Record<string, unknown>>(
    eventClass: EventClass<T>,
    handler: Handler<T>,
  ): void {
    const list = handlers.get(eventClass.type) ?? [];
    list.push(handler);
    handlers.set(eventClass.type, list);
  },

  /**
   * Dispatch event to all registered handlers
   *
   * Called by the worker task to process events from the outbox.
   *
   * @param eventType - Event type string
   * @param payload - Event payload
   */
  async dispatch(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const list = handlers.get(eventType) ?? [];

    if (list.length === 0) {
      console.info(`[Event] No handlers registered for: ${eventType}`);
      return;
    }

    for (const handler of list) {
      try {
        const result = await handler(payload);
        // Stop propagation if handler returns false
        if (result === false) {
          console.info(`[Event] Propagation stopped for: ${eventType}`);
          break;
        }
      } catch (error) {
        console.error(`[Event] Handler failed for ${eventType}:`, error);
        // Continue to next handler even if one fails
      }
    }
  },

  /**
   * Get all registered handlers (for debugging/testing)
   */
  getHandlers(): Map<string, Handler<any>[]> {
    return handlers;
  },

  /**
   * Clear all handlers (for testing)
   */
  clearHandlers(): void {
    handlers.clear();
  },
};

// Re-export constants for convenience
export {
  SYSTEM_ACTOR_UUID,
  WEBHOOK_ACTOR_UUID,
  CRON_ACTOR_UUID,
  API_ACTOR_UUID,
  ORGANIZATION_ACTOR_UUID,
};
