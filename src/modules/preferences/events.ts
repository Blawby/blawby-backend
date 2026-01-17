
/**
 * Preferences Event Registration
 *
 * Event registration with functional handlers for preferences initialization
 */

import { initializeUserPreferences } from '@/modules/preferences/services/preferences.service';
import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

// Event-to-Handler mapping
export const PREFERENCES_EVENTS: Record<string, {
  handler: (event: BaseEvent) => Promise<void | boolean>;
  options?: Record<string, unknown>;
}> = {
  [EventType.AUTH_USER_SIGNED_UP]: {
    handler: async (event: BaseEvent) => {
      const userId = event.actorId;
      if (!userId) {
        console.warn('AUTH_USER_SIGNED_UP event missing actorId');
        return;
      }

      try {
        await initializeUserPreferences(userId);
        console.info('User preferences initialized with defaults', { userId });
      } catch (error) {
        console.error('Failed to initialize user preferences', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't throw - preferences can be initialized later if needed
      }
    },
    options: {
      priority: 5, // Run after Stripe customer creation (priority 10) but early
    },
  },
} as const;

// Register all preferences event handlers
export const registerPreferencesEvents = (): void => {
  console.info('Registering preferences event handlers...');

  for (const [eventType, config] of Object.entries(PREFERENCES_EVENTS)) {
    subscribeToEvent(eventType, config.handler, config.options);
  }

  console.info(`Registered ${Object.keys(PREFERENCES_EVENTS).length} preferences handlers`);
};
