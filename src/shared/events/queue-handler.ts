/**
 * Queue Event Handler
 *
 * Adds event handler execution to a BullMQ queue for async processing.
 */

import type { BaseEvent } from './schemas/events.schema';
import { getQueue } from '@/shared/queue/queue.manager';

export const queueEventHandler = async (
  handlerName: string,
  event: BaseEvent,
  queueName: string,
): Promise<void> => {
  const queue = getQueue(queueName);

  await queue.add(
    handlerName, // Job name is the handler name
    { event, handlerName }, // Job data
    {
      jobId: `${event.eventId}-${handlerName}`, // Unique ID for deduplication
      attempts: 3, // Retry failed jobs
      backoff: {
        type: 'exponential',
        delay: 1000, // 1s, 2s, 4s
      },
    },
  );

  console.info(`Event handler '${handlerName}' queued for event ${event.eventType} (Job ID: ${event.eventId}-${handlerName})`);
};
