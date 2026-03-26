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

import { randomUUID } from 'node:crypto';
import { getLogger } from '@logtape/logtape';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  SYSTEM_ACTOR_UUID,
  WEBHOOK_ACTOR_UUID,
  CRON_ACTOR_UUID,
  API_ACTOR_UUID,
  ORGANIZATION_ACTOR_UUID,
} from './constants';
import { events, type EventMetadata, type BaseEvent as BaseEventRecord, type NewEvent } from './schemas/events.schema';
import type * as schema from '@/schema';
import { db } from '@/shared/database';
import { TASK_NAMES } from '@/shared/queue/queue.config';
import { getAppEnv } from '@/shared/utils/env';

const logger = getLogger(['events', 'system']);

// Handler function type
type Handler<T> = (payload: T, context?: BaseEventRecord) => Promise<void | boolean>;

// Dispatch options type
export interface DispatchOptions {
  actorId?: string;
  actorType?: 'user' | 'system' | 'webhook' | 'cron' | 'api' | 'organization';
  organizationId?: string;
  tx?: NodePgDatabase<typeof schema>;
  /** For critical events (Stripe/payments): immediate DB write, guaranteed before response */
  critical?: boolean;
}

// Event class type - infers payload type T from constructor parameter
export interface EventClass<T extends Record<string, unknown> = Record<string, unknown>> {
  type: string;
  new (payload: T, actorId?: string, organizationId?: string): BaseEvent<T>;
  dispatch(payload: T, options?: DispatchOptions): string | Promise<string>;
}

// Global handler registry - populated by Event.listen()
const handlers = new Map<string, Handler<Record<string, unknown>>[]>();

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
      logger.warn('Unknown actorId {actorId} mapped to SYSTEM_ACTOR_UUID', {
        actorId,
        fallback: SYSTEM_ACTOR_UUID,
      });
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
    public readonly organizationId?: string
  ) {}

  /**
   * Dispatch event - Three-tier approach for production-grade performance
   *
   * 1. Transactional (tx): Atomic with business logic - caller must await
   * 2. Critical (critical: true): Immediate DB write - caller must await
   * 3. Fire-and-forget: Async DB write - returns immediately, non-blocking
   *
   * @param payload - Event-specific payload data
   * @param options - Optional dispatch options
   * @returns Event ID (UUID) - for async dispatch, returns before DB write completes
   */
  static dispatch<T extends Record<string, unknown>>(
    this: { type: string; new (payload: T): BaseEvent<T> },
    payload: T,
    options?: DispatchOptions
  ): string | Promise<string> {
    const eventId = randomUUID();
    const rawActorId = options?.actorId ?? 'system';
    const resolvedActorId = resolveActorId(rawActorId);

    // Derive actorType from rawActorId if not explicitly provided
    const resolvedActorType: 'user' | 'system' | 'webhook' | 'cron' | 'api' | 'organization' =
      options?.actorType ??
      (rawActorId === 'system'
        ? 'system'
        : rawActorId === 'webhook'
          ? 'webhook'
          : rawActorId === 'cron'
            ? 'cron'
            : rawActorId === 'api'
              ? 'api'
              : rawActorId === 'organization'
                ? 'organization'
                : 'user');

    const record = {
      eventId,
      type: this.type,
      eventVersion: '1.0.0',
      actorId: resolvedActorId,
      actorType: resolvedActorType,
      organizationId: options?.organizationId,
      payload,
      metadata: createEventMetadata(options?.tx ? 'tx' : options?.critical ? 'critical' : 'async'),
      processed: false,
      retryCount: 0,
    };

    // 1. Transactional: Atomic with business logic (caller awaits)
    if (options?.tx) {
      return dispatchTransactional(record, options.tx, eventId, this.type);
    }

    // 2. Critical: Immediate DB write, guaranteed persistence (caller awaits)
    if (options?.critical) {
      return dispatchCritical(record, eventId, this.type);
    }

    // 3. Fire-and-forget: Async DB write (non-blocking, returns immediately)
    dispatchAsync(record, eventId, this.type);
    return eventId;
  }
}

/**
 * Transactional dispatch: Write to outbox + queue job atomically
 * Used when event must be atomic with business logic (inside db.transaction)
 */
async function dispatchTransactional(
  record: NewEvent,
  tx: NodePgDatabase<typeof schema>,
  eventId: string,
  eventType: string
): Promise<string> {
  try {
    await tx.insert(events).values(record);
    await tx.execute(sql`
      SELECT graphile_worker.add_job(
        ${TASK_NAMES.PROCESS_OUTBOX_EVENT},
        json_build_object('eventId', ${eventId}::text)::json
      );
    `);
    return eventId;
  } catch (error) {
    logger.error('Failed to dispatch transactional event {eventType}: {error}', {
      eventType,
      error: error instanceof Error ? error.message : String(error),
      eventId,
    });
    throw error; // Re-throw to rollback transaction
  }
}

/**
 * Critical dispatch: Immediate DB write, no transaction
 * Used for Stripe/payment events that must persist before API response
 */
async function dispatchCritical(record: NewEvent, eventId: string, eventType: string): Promise<string> {
  try {
    await db.insert(events).values(record);
    // Use NOTIFY for instant worker pickup
    await db.execute(sql`NOTIFY new_events`);
    return eventId;
  } catch (error) {
    logger.error('Failed to dispatch critical event {eventType}: {error}', {
      eventType,
      error: error instanceof Error ? error.message : String(error),
      eventId,
    });
    return ''; // Return empty string on failure (don't throw - critical but not transactional)
  }
}

/**
 * Async dispatch: Non-blocking DB write using setImmediate
 * Used for fire-and-forget events (practice, client, user activity)
 * Events are still persisted to outbox (durable), just doesn't block the response
 */
function dispatchAsync(record: NewEvent, eventId: string, eventType: string): void {
  // Use setImmediate to defer to next event loop tick - truly non-blocking
  setImmediate(async () => {
    try {
      await db.insert(events).values(record);
      // Use NOTIFY for instant worker pickup
      await db.execute(sql`NOTIFY new_events`);
    } catch (error) {
      // Log but don't throw - this is fire-and-forget
      logger.error('Failed to persist fire-and-forget event {eventType}: {error}', {
        eventType,
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
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
  listen<T extends Record<string, unknown>>(eventClass: EventClass<T>, handler: Handler<T>): void {
    const list = handlers.get(eventClass.type) ?? [];
    list.push(handler as Handler<Record<string, unknown>>);
    handlers.set(eventClass.type, list);
  },

  /**
   * Dispatch event to all registered handlers
   *
   * Called by the worker task to process events from the outbox.
   *
   * @param record - Full event record from database
   */
  async dispatch(eventType: string, record: BaseEventRecord): Promise<void> {
    const list = handlers.get(eventType) ?? [];

    if (list.length === 0) {
      logger.info('No handlers registered for event type {eventType}', { eventType });
      return;
    }

    const {payload} = record;

    for (const handler of list) {
      try {
        const result = await handler(payload, record);
        // Stop propagation if handler returns false
        if (result === false) {
          logger.info('Propagation stopped for event type {eventType}', { eventType });
          break;
        }
      } catch (error) {
        logger.error('Handler failed for event type {eventType}: {error}', {
          eventType,
          eventId: record.eventId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue to next handler even if one fails
      }
    }
  },

  /**
   * Get all registered handlers (for debugging/testing)
   */
  getHandlers(): Map<string, Handler<Record<string, unknown>>[]> {
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
export { SYSTEM_ACTOR_UUID, WEBHOOK_ACTOR_UUID, CRON_ACTOR_UUID, API_ACTOR_UUID, ORGANIZATION_ACTOR_UUID };
