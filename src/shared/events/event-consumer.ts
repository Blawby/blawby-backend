import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { setEventHandlersMap } from '@/shared/events/event-handler-registry';

// Handler options interface (Laravel-style)
export interface HandlerOptions {
  priority?: number; // Default: 0, higher = earlier
  queue?: string; // Queue name for async processing
  shouldQueue?: boolean; // Whether to queue this handler
  stopPropagation?: boolean; // Stop other handlers after this one
}

// Handler metadata for internal tracking
export interface HandlerMetadata {
  name: string;
  handler: (event: BaseEvent) => Promise<void | boolean>;
  options: HandlerOptions;
}

// Store handlers with metadata for priority sorting
const eventHandlers = new Map<string, HandlerMetadata[]>();

// Export handlers map for worker access
setEventHandlersMap(eventHandlers);

// Subscribe to specific event types with options
// Handlers are registered and will be called by the outbox worker via dispatchEventToHandlers()
export const subscribeToEvent = (
  eventType: string,
  handler: (event: BaseEvent) => Promise<void | boolean>,
  options: HandlerOptions = {},
): void => {
  const handlerName = options.queue || handler.name || 'anonymous';

  // Initialize handlers array for this event type if needed
  if (!eventHandlers.has(eventType)) {
    eventHandlers.set(eventType, []);
  }

  const handlers = eventHandlers.get(eventType)!;
  handlers.push({
    name: handlerName,
    handler,
    options: {
      priority: options.priority ?? 0,
      queue: options.queue,
      shouldQueue: options.shouldQueue ?? false,
      stopPropagation: options.stopPropagation ?? false,
    },
  });

  // Sort by priority (higher priority first)
  handlers.sort((a, b) => b.options.priority! - a.options.priority!);
};


