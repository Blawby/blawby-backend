/**
 * Process Outbox Event Task
 *
 * Graphile Worker task that polls the events table for unprocessed events,
 * dispatches them to registered handlers, and updates processing status.
 *
 * This implements the Transactional Outbox Pattern - events are written to
 * the database within business transactions, then processed asynchronously.
 */

import { eq, and, asc } from 'drizzle-orm';
import type { Task } from 'graphile-worker';
import { db } from '@/shared/database';
import { events } from '@/shared/events/schemas/events.schema';
import { dispatchEventToHandlers } from '@/shared/events/event-handler-registry';

const BATCH_SIZE = 10; // Process 10 events at a time

/**
 * Process outbox event
 *
 * Task name: process-outbox-event
 *
 * This task queries for unprocessed events and processes them in batches.
 * It can be called directly or scheduled to run periodically.
 */
export const processOutboxEvent: Task = async (
  payload: unknown,
  helpers,
): Promise<void> => {
  helpers.logger.info('Processing outbox events...');

  try {
    // Query for unprocessed events (processed = false)
    // Order by created_at to process oldest first
    const unprocessedEvents = await db
      .select()
      .from(events)
      .where(eq(events.processed, false))
      .orderBy(asc(events.createdAt))
      .limit(BATCH_SIZE);

    if (unprocessedEvents.length === 0) {
      helpers.logger.info('No unprocessed events found');
      return;
    }

    helpers.logger.info(`Found ${unprocessedEvents.length} unprocessed events`);

    // Process each event
    for (const event of unprocessedEvents) {
      try {
        // Convert database event to BaseEvent format
        const baseEvent = {
          eventId: event.eventId,
          type: event.type,
          eventVersion: event.eventVersion,
          timestamp: event.createdAt,
          actorId: event.actorId,
          actorType: event.actorType as 'user' | 'system' | 'webhook' | 'cron' | 'api',
          organizationId: event.organizationId || undefined,
          payload: event.payload as Record<string, unknown>,
          metadata: event.metadata,
          processed: event.processed,
          retryCount: event.retryCount,
        };

        // Dispatch to registered handlers
        await dispatchEventToHandlers(baseEvent);

        // Mark as processed
        await db
          .update(events)
          .set({
            processed: true,
            processedAt: new Date(),
          })
          .where(eq(events.eventId, event.eventId));

        helpers.logger.info(`Processed event ${event.eventId} (${event.type})`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        helpers.logger.error(`Failed to process event ${event.eventId}:`, { error });

        // Update retry count and error message
        await db
          .update(events)
          .set({
            retryCount: event.retryCount + 1,
            lastError: errorMessage,
          })
          .where(eq(events.eventId, event.eventId));

        // Re-throw to trigger Graphile Worker retry mechanism
        throw error;
      }
    }

    helpers.logger.info(`Completed processing ${unprocessedEvents.length} events`);
  } catch (error) {
    helpers.logger.error('Error processing outbox events:', { error });
    throw error;
  }
};
