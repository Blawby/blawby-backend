/**
 * Event Handler Registry
 *
 * Stores registered handlers for queued execution.
 * Used by Graphile Worker tasks to execute event handlers.
 */

import type { BaseEvent } from './schemas/events.schema';

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
 * Get a registered handler by name
 */
export const getQueuedHandler = (
  handlerName: string,
): ((event: BaseEvent) => Promise<void | boolean>) | undefined => {
  return queuedHandlers.get(handlerName);
};

