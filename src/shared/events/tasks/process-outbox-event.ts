/**
 * Process Outbox Event Task
 *
 * Graphile Worker task that polls the events table for unprocessed events,
 * dispatches them to registered handlers, and updates processing status.
 *
 * This implements the Transactional Outbox Pattern - events are written to
 * the database within business transactions, then processed asynchronously.
 */

import { eq, and, lt, asc } from 'drizzle-orm';
import type { Task } from 'graphile-worker';
import { db } from '@/shared/database';
import { Event } from '@/shared/events/event';
import { eventsDeadLetter } from '@/shared/events/schemas/events-dead-letter.schema';
import { events } from '@/shared/events/schemas/events.schema';

// Batch processing configuration
const BATCH_SIZE = 10; // Process 10 events at a time
const MAX_RETRIES = 5; // Maximum retry attempts before giving up

/**
 * Process outbox event
 *
 * Task name: process-outbox-event
 *
 * This task queries for unprocessed events and processes them in batches.
 * It can be called directly or scheduled to run periodically.
 */
export const processOutboxEvent: Task = async (payload: unknown, helpers): Promise<void> => {
  const { eventId } = (payload as { eventId?: string }) || {};

  if (eventId) {
    helpers.logger.info(`Processing specific outbox event: ${eventId}`);
  } else {
    helpers.logger.info('Processing outbox events (batch mode)...');
  }

  try {
    let unprocessedEvents;

    if (eventId) {
      // Process specific event request
      unprocessedEvents = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.eventId, eventId),
            eq(events.processed, false), // Only process if still pending
            lt(events.retryCount, MAX_RETRIES)
          )
        )
        .limit(1);
    } else {
      // Batch processing (Cron / Recovery)
      // Query for unprocessed events (processed = false) that haven't exceeded max retries
      // Order by created_at to process oldest first
      unprocessedEvents = await db
        .select()
        .from(events)
        .where(and(eq(events.processed, false), lt(events.retryCount, MAX_RETRIES)))
        .orderBy(asc(events.createdAt))
        .limit(BATCH_SIZE);
    }

    if (unprocessedEvents.length === 0) {
      if (eventId) {
        helpers.logger.info(`Event ${eventId} not found or already processed`);
      } else {
        helpers.logger.info('No unprocessed events found');
      }
      return;
    }

    helpers.logger.info(`Found ${unprocessedEvents.length} unprocessed events`);

    const errors: { eventId: string; error: unknown }[] = [];

    // Process each event
    for (const event of unprocessedEvents) {
      try {
        // Dispatch to registered handlers using the new Event system
        await Event.dispatch(event.type, event);

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

        const newRetryCount = event.retryCount + 1;

        // Check if max retries exceeded - move to dead letter queue
        if (newRetryCount >= MAX_RETRIES) {
          helpers.logger.warn(`Event ${event.eventId} exceeded max retries, moving to dead letter queue`);

          await db.transaction(async (tx) => {
            // Move to dead letter queue
            await tx.insert(eventsDeadLetter).values({
              eventId: event.eventId,
              type: event.type,
              eventVersion: event.eventVersion,
              actorId: event.actorId,
              actorType: event.actorType,
              organizationId: event.organizationId,
              payload: event.payload,
              metadata: event.metadata,
              lastError: errorMessage,
              retryCount: newRetryCount,
              originalCreatedAt: event.createdAt,
            });

            // Remove from main events table
            await tx.delete(events).where(eq(events.eventId, event.eventId));
          });

          helpers.logger.warn(`Event ${event.eventId} moved to dead letter queue`);
        } else {
          // Update retry count and error message
          await db
            .update(events)
            .set({
              retryCount: newRetryCount,
              lastError: errorMessage,
            })
            .where(eq(events.eventId, event.eventId));
        }

        // Collect error to throw after batch completes
        errors.push({ eventId: event.eventId, error });
      }
    }

    helpers.logger.info(`Completed processing ${unprocessedEvents.length} events (${errors.length} failed)`);

    // Throw aggregated error if any events failed
    if (errors.length > 0) {
      throw new Error(`Failed to process ${errors.length} events: ${errors.map((e) => e.eventId).join(', ')}`);
    }
  } catch (error) {
    helpers.logger.error('Error processing outbox events:', { error });
    throw error;
  }
};
