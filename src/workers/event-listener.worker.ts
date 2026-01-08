/**
 * Event Listener Worker
 *
 * Exports registration function for event handlers.
 * The actual processing is done by the process-event-handler Graphile Worker task.
 */

import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import {
  registerQueuedHandler as registerHandler,
} from '@/shared/events/event-handler-registry';

/**
 * Register a handler for queued execution
 * Handlers registered here will be executed by the process-event-handler task
 */
export const registerQueuedHandler = registerHandler;

/**
 * Note: Event listener worker is no longer a separate BullMQ worker.
 * Event handlers are processed by the Graphile Worker task: process-event-handler
 * The webhook worker loads all tasks including process-event-handler.
 */
