/**
 * Process Event Handler Task
 *
 * Graphile Worker task for processing queued event handlers.
 * Executes registered event handlers asynchronously.
 */

import type { Task } from 'graphile-worker';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { getQueuedHandler } from '@/shared/events/event-handler-registry';

interface ProcessEventHandlerPayload {
  handlerName: string;
  event: BaseEvent;
}

/**
 * Process event handler
 *
 * Task name: process-event-handler
 */
export const processEventHandler: Task = async (
  payload: ProcessEventHandlerPayload,
  helpers,
): Promise<void | boolean> => {
  const { handlerName, event } = payload;

  // Get the registered handler
  const handler = getQueuedHandler(handlerName);
  if (!handler) {
    throw new Error(`Handler '${handlerName}' not found for queued execution`);
  }

  // Execute the handler
  const result = await handler(event);

  // Log completion
  helpers.logger.info(
    `Queued event handler '${handlerName}' completed for event ${event.eventType}`,
  );

  return result;
};

