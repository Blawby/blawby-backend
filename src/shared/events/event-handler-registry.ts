/**
 * Event Handler Registry
 *
 * Stores registered handlers for execution.
 * Used by Graphile Worker tasks via the outbox pattern.
 */

import type { BaseEvent } from './schemas/events.schema';
import type { HandlerMetadata } from './event-consumer';

// Store registered handlers for queued execution (legacy)
const queuedHandlers = new Map<string, (event: BaseEvent) => Promise<void | boolean>>();

// Store all registered handlers by event type (from event-consumer)
// This is populated by subscribeToEvent calls
let eventHandlersMap: Map<string, HandlerMetadata[]> | null = null;

/**
 * Set the event handlers map from event-consumer
 * This allows the worker to access handlers registered via subscribeToEvent
 */
export const setEventHandlersMap = (
  handlersMap: Map<string, HandlerMetadata[]>,
): void => {
  eventHandlersMap = handlersMap;
};

/**
 * Register a handler for queued execution (legacy - for backward compatibility)
 */
export const registerQueuedHandler = (
  handlerName: string,
  handler: (event: BaseEvent) => Promise<void | boolean>,
): void => {
  queuedHandlers.set(handlerName, handler);
};

/**
 * Get a registered handler by name (legacy)
 */
export const getQueuedHandler = (
  handlerName: string,
): ((event: BaseEvent) => Promise<void | boolean>) | undefined => {
  return queuedHandlers.get(handlerName);
};

/**
 * Dispatch event to all registered handlers for the event type
 *
 * This is called by the worker task to process events from the outbox.
 * It executes all handlers registered for the event type.
 */
export const dispatchEventToHandlers = async (
  event: BaseEvent,
): Promise<void> => {
  if (!eventHandlersMap) {
    console.warn('Event handlers map not initialized. Handlers may not be registered yet.');
    return;
  }

  const handlers = eventHandlersMap.get(event.type) || [];

  if (handlers.length === 0) {
    console.info(`No handlers registered for event type: ${event.type}`);
    return;
  }

  // Execute handlers in priority order (higher priority first)
  for (const { handler, options, name } of handlers) {
    try {
      const result = await handler(event);

      // Stop propagation if handler returns false
      if (result === false || options.stopPropagation) {
        console.info(`Event propagation stopped by handler: ${name}`);
        break;
      }
    } catch (error) {
      console.error(`Event handler '${name}' failed for ${event.type}:`, error);
      // Continue to next handler even if one fails
    }
  }
};

