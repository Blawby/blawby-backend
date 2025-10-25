/**
 * Event Listener Worker
 *
 * Processes queued event listeners using BullMQ
 */

import { Worker } from 'bullmq';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { getRedisConnection } from '@/shared/queue/redis.client';

// Store registered handlers for queued execution
const queuedHandlers = new Map<string, (event: BaseEvent) => Promise<void | boolean>>();

/**
 * Register a handler for queued execution
 */
export const registerQueuedHandler = (
  handlerName: string,
  handler: (event: BaseEvent) => Promise<void | boolean>,
): void => {
  queuedHandlers.set(handlerName, handler);
};

/**
 * Create event listener worker
 */
export const createEventListenerWorker = (): Worker => {
  return new Worker('events', async (job) => {
    const { handlerName, event } = job.data;

    // Get the registered handler
    const handler = queuedHandlers.get(handlerName);
    if (!handler) {
      throw new Error(`Handler '${handlerName}' not found for queued execution`);
    }

    // Execute the handler
    const result = await handler(event);

    // Log completion
    console.info(`Queued event handler '${handlerName}' completed for event ${event.eventType}`);

    return result;
  }, {
    connection: getRedisConnection(),
    concurrency: 5, // Process up to 5 jobs concurrently
  });
};
