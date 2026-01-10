/**
 * Process Event Handler Task
 *
 * Graphile Worker task for processing queued event handlers.
 * Executes registered event handlers asynchronously.
 */

import { z } from 'zod';
import type { Task } from 'graphile-worker';
import { baseEventSchema } from '@/shared/events/schemas/events.schema';
import { getQueuedHandler } from '@/shared/events/event-handler-registry';

const processEventHandlerPayloadSchema = z.object({
  handlerName: z.string(),
  event: baseEventSchema,
});

/**
 * Process event handler
 *
 * Task name: process-event-handler
 */
export const processEventHandler: Task = async (
  payload: unknown,
  helpers,
): Promise<void> => {
  const result = processEventHandlerPayloadSchema.safeParse(payload);

  if (!result.success) {
    const errorMsg = `Invalid payload for process-event-handler: ${result.error.message}`;
    helpers.logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const { handlerName, event } = result.data;

  // Get the registered handler
  const handler = getQueuedHandler(handlerName);
  if (!handler) {
    throw new Error(`Handler '${handlerName}' not found for queued execution`);
  }

  // Execute the handler
  await handler(event);

  // Log completion
  helpers.logger.info(
    `Queued event handler '${handlerName}' completed for event ${event.eventType}`,
  );
};

