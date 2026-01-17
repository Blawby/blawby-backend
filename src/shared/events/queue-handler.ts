/**
 * Queue Event Handler
 *
 * Adds event handler execution to Graphile Worker queue for async processing.
 */

import type { BaseEvent } from './schemas/events.schema';
import { TASK_NAMES, graphileWorkerConfig } from '@/shared/queue/queue.config';
import { getWorkerUtils } from '@/shared/queue/graphile-worker.client';

export const queueEventHandler = async (
  handlerName: string,
  event: BaseEvent,
  _queueName: string, // Ignored - Graphile Worker uses task names, not queue names
): Promise<void> => {
  const workerUtils = await getWorkerUtils();

  try {
    await workerUtils.addJob(
      TASK_NAMES.PROCESS_EVENT_HANDLER,
      { event, handlerName },
      {
        jobKey: `${event.eventId}-${handlerName}`, // Unique ID for deduplication
        maxAttempts: 3, // Retry failed jobs
      },
    );

    console.info(`✅ Event handler '${handlerName}' queued for event ${event.type} (Job ID: ${event.eventId}-${handlerName})`);
  } catch (error) {
    console.error(`❌ Failed to queue event handler '${handlerName}' for event ${event.type}:`, error);
    throw error;
  }
};
