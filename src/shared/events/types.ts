/**
 * Event System Types
 *
 * Type definitions for the Laravel-like event system
 */

import type { BaseEvent } from './schemas/events.schema';

/**
 * Event handler function type
 */
export interface EventHandler<T = BaseEvent> {
  (event: T): Promise<void | boolean>;
}

/**
 * Event configuration for Laravel-style registration
 */
export interface EventConfig {
  handler: EventHandler;
  options?: HandlerOptions;
}

/**
 * Event map type for centralized event registration
 */
export interface EventMap {
  [eventType: string]: EventConfig;
}

/**
 * Handler options interface (Laravel-style)
 */
export interface HandlerOptions {
  priority?: number; // Default: 0, higher = earlier
  queue?: string; // Queue name for async processing
  shouldQueue?: boolean; // Whether to queue this handler
  stopPropagation?: boolean; // Stop other handlers after this one
}

/**
 * Handler metadata for internal tracking
 */
export interface HandlerMetadata {
  name: string;
  handler: EventHandler;
  options: HandlerOptions;
}

/**
 * Event registration function type
 */
export type EventRegistrationFunction = () => void;

/**
 * Event handler registration map
 */
export interface EventHandlerRegistrations {
  [moduleName: string]: EventRegistrationFunction;
}
