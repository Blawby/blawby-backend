import { db } from '@/shared/database';
import { getActiveTx, isInTransaction } from '@/shared/database/uow';
import {
  API_ACTOR_UUID,
  CRON_ACTOR_UUID,
  ORGANIZATION_ACTOR_UUID,
  SYSTEM_ACTOR_UUID,
  WEBHOOK_ACTOR_UUID,
} from '@/shared/events/constants';
import { eventsDeadLetter } from '@/shared/events/schemas/events-dead-letter.schema';
import {
  events,
  type BaseEvent as BaseEventRecord,
  type EventMetadata,
  type NewEvent,
} from '@/shared/events/schemas/events.schema';
import type { DispatchOptions, EventClass, Handler } from '@/shared/events/types/event.types';
import { TASK_NAMES } from '@/shared/queue/queue.config';
import { getAppEnv } from '@/shared/utils/env';
import { getLogger } from '@logtape/logtape';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const logger = getLogger(['events', 'system']);

type ActorType = 'user' | 'system' | 'webhook' | 'cron' | 'api' | 'organization';

const ACTOR_ID_MAP: Record<string, string> = {
  system: SYSTEM_ACTOR_UUID,
  webhook: WEBHOOK_ACTOR_UUID,
  cron: CRON_ACTOR_UUID,
  api: API_ACTOR_UUID,
  organization: ORGANIZATION_ACTOR_UUID,
};

const ACTOR_TYPE_MAP: Record<string, ActorType> = {
  [SYSTEM_ACTOR_UUID]: 'system',
  [WEBHOOK_ACTOR_UUID]: 'webhook',
  [CRON_ACTOR_UUID]: 'cron',
  [API_ACTOR_UUID]: 'api',
  [ORGANIZATION_ACTOR_UUID]: 'organization',
};

const handlers = new Map<string, Handler<Record<string, unknown>>[]>();

const resolveActorId = (actorId: string): string => {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(actorId)) {
    return actorId;
  }
  const resolved = ACTOR_ID_MAP[actorId];
  if (!resolved) {
    logger.warn('Unknown actorId {actorId} mapped to SYSTEM_ACTOR_UUID', {
      actorId,
      fallback: SYSTEM_ACTOR_UUID,
    });
    return SYSTEM_ACTOR_UUID;
  }
  return resolved;
};

const createEventMetadata = (source: string): EventMetadata => ({
  source,
  environment: getAppEnv(),
});

const dispatchTransactional = async (record: NewEvent, eventId: string, eventType: string): Promise<string> => {
  const tx = getActiveTx();
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
    throw error;
  }
};

const dispatchCritical = async (record: NewEvent, eventId: string, eventType: string): Promise<string> => {
  try {
    await db.insert(events).values(record);
    await db.execute(sql`NOTIFY new_events`);
    return eventId;
  } catch (error) {
    logger.error('Failed to dispatch critical event {eventType}: {error}', {
      eventType,
      error: error instanceof Error ? error.message : String(error),
      eventId,
    });
    throw error;
  }
};

const dispatchAsync = (record: NewEvent, eventId: string, eventType: string): void => {
  void (async () => {
    try {
      await db.insert(events).values(record);
      await db.execute(sql`NOTIFY new_events`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to persist fire-and-forget event {eventType}: {error}', {
        eventType,
        eventId,
        error: errorMessage,
      });

      try {
        await db.insert(eventsDeadLetter).values({
          eventId,
          type: record.type,
          eventVersion: record.eventVersion,
          actorId: record.actorId,
          actorType: record.actorType,
          organizationId: record.organizationId,
          payload: record.payload,
          metadata: record.metadata,
          lastError: errorMessage,
          retryCount: 0,
          originalCreatedAt: new Date(),
        });
      } catch (deadLetterError) {
        logger.error('Failed to write fire-and-forget event {eventType} to dead letter queue: {error}', {
          eventType,
          eventId,
          error: deadLetterError instanceof Error ? deadLetterError.message : String(deadLetterError),
        });
      }
    }
  })();
};

export abstract class BaseEvent<T extends Record<string, unknown>> {
  readonly payload: T;
  readonly actorId: string;
  readonly organizationId?: string;

  constructor(payload: T, actorId = 'system', organizationId?: string) {
    this.payload = payload;
    this.actorId = actorId;
    this.organizationId = organizationId;
  }

  static dispatch<T extends Record<string, unknown>>(
    this: { type: string; new (payload: T): BaseEvent<T> },
    payload: T,
    options?: DispatchOptions
  ): string | Promise<string> {
    const eventId = randomUUID();
    const rawActorId = options?.actorId ?? 'system';
    const resolvedActorId = resolveActorId(rawActorId);

    const resolvedActorType: ActorType = options?.actorType ?? ACTOR_TYPE_MAP[resolvedActorId] ?? 'user';

    const inTx = isInTransaction();
    let metadataSource = 'async';
    if (inTx) {
      metadataSource = 'tx';
    } else if (options?.critical) {
      metadataSource = 'critical';
    }

    const record = {
      eventId,
      type: this.type,
      eventVersion: '1.0.0',
      actorId: resolvedActorId,
      actorType: resolvedActorType,
      organizationId: options?.organizationId,
      payload,
      metadata: createEventMetadata(metadataSource),
      processed: false,
      retryCount: 0,
    };

    if (inTx) {
      return dispatchTransactional(record, eventId, this.type);
    }

    if (options?.critical) {
      return dispatchCritical(record, eventId, this.type);
    }

    dispatchAsync(record, eventId, this.type);
    return eventId;
  }
}

export const Event = {
  listen<T extends Record<string, unknown>>(eventClass: EventClass<T>, handler: Handler<T>): void {
    const list = handlers.get(eventClass.type) ?? [];
    list.push(handler as Handler<Record<string, unknown>>);
    handlers.set(eventClass.type, list);
  },

  async dispatch(eventType: string, record: BaseEventRecord): Promise<void> {
    const list = handlers.get(eventType) ?? [];

    if (list.length === 0) {
      logger.info('No handlers registered for event type {eventType}', { eventType });
      return;
    }

    const { payload } = record;

    for (const handler of list) {
      try {
        const result = await handler(payload, record);
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
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
  },

  getHandlers(): Map<string, Handler<Record<string, unknown>>[]> {
    return handlers;
  },

  clearHandlers(): void {
    handlers.clear();
  },
};

export { API_ACTOR_UUID, CRON_ACTOR_UUID, ORGANIZATION_ACTOR_UUID, SYSTEM_ACTOR_UUID, WEBHOOK_ACTOR_UUID };
