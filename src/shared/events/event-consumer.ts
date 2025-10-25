import { EventEmitter } from 'events';
import { eq } from 'drizzle-orm';
import { db } from '@/shared/database';
import { queueEventHandler } from '@/shared/events/queue-handler';
import { events } from '@/shared/events/schemas/events.schema';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

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

// Global event bus instance
export const eventBus = new EventEmitter();

// Initialize event bus with proper settings
eventBus.setMaxListeners(100); // Support many handlers

// Store handlers with metadata for priority sorting
const eventHandlers = new Map<string, HandlerMetadata[]>();

// Subscribe to specific event types with options
export const subscribeToEvent = (
  eventType: string,
  handler: (event: BaseEvent) => Promise<void | boolean>,
  options: HandlerOptions = {},
): void => {
  const handlerName = options.queue || handler.name || 'anonymous';

  // Store handler with metadata
  if (!eventHandlers.has(eventType)) {
    eventHandlers.set(eventType, []);

    // Register EventEmitter handler only once per event type
    eventBus.on(eventType, async (event: BaseEvent) => {
      const handlers = eventHandlers.get(eventType) || [];

      for (const { handler: h, options: opts, name } of handlers) {
        try {
          // Queue handler if needed
          if (opts.shouldQueue && opts.queue) {
            await queueHandler(name, event, opts.queue);
            continue;
          }

          // Execute handler immediately (async)
          const result = await h(event);

          // Stop propagation if handler returns false
          if (result === false || opts.stopPropagation) {
            console.info(`Event propagation stopped by handler: ${name}`);
            break;
          }

          // Save event to database asynchronously (don't await)
          saveEventToDatabase(event).catch((error) => {
            console.error(`Failed to save event ${event.eventId} to database:`, error);
          });
        } catch (error) {
          console.error(`Event handler '${name}' failed for ${eventType}:`, error);
          // Mark failure asynchronously (don't await)
          handleEventFailure(event, error).catch((err) => {
            console.error(`Failed to handle event failure for ${event.eventId}:`, err);
          });
        }
      }
    });
  }

  const handlers = eventHandlers.get(eventType)!;
  handlers.push({
    name: handlerName,
    handler,
    options: {
      priority: options.priority ?? 0,
      queue: options.queue,
      shouldQueue: options.shouldQueue ?? false, // Default to immediate async execution
      stopPropagation: options.stopPropagation ?? false,
    },
  });

  // Sort by priority (higher priority first)
  handlers.sort((a, b) => b.options.priority! - a.options.priority!);
};

// Queue handler for async processing
const queueHandler = async (
  handlerName: string,
  event: BaseEvent,
  queueName: string,
): Promise<void> => {
  await queueEventHandler(handlerName, event, queueName);
};


// Helper function to save events to database when needed
export const saveEventToDatabase = async (event: BaseEvent): Promise<void> => {
  try {
    await db.insert(events).values({
      eventId: event.eventId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      actorId: event.actorId,
      actorType: event.actorType,
      organizationId: event.organizationId,
      payload: event.payload,
      metadata: event.metadata,
      processed: false,
      retryCount: 0,
    });
  } catch (error) {
    console.error(`Failed to save event ${event.eventId} to database:`, error);
    throw error;
  }
};

// Simple event processing tracking (optional - only if handlers need it)
const markEventAsProcessed = async (eventId: string): Promise<void> => {
  try {
    await db
      .update(events)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(events.eventId, eventId));
  } catch (error) {
    console.error(`Failed to mark event ${eventId} as processed:`, error);
  }
};

const handleEventFailure = async (
  event: BaseEvent,
  error: unknown,
): Promise<void> => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  try {
    await db
      .update(events)
      .set({
        retryCount: (event as { retryCount: number }).retryCount + 1,
        lastError: errorMessage,
      })
      .where(eq(events.eventId, event.eventId));
  } catch (dbError) {
    console.error(`Failed to update event failure for ${event.eventId}:`, dbError);
  }
};
