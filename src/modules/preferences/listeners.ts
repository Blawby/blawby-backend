/**
 * Preferences Module Event Listeners
 *
 * Handles preference initialization for new users.
 */

import { getLogger } from '@logtape/logtape';
import { preferencesService } from '@/modules/preferences/services/preferences.service';
import { AuthUserSignedUp } from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';

const logger = getLogger(['preferences', 'listeners']);

/**
 * Register all preferences event listeners
 */
const registerPreferencesListeners = (): void => {
  logger.info('Registering preferences event listeners...');

  // Initialize user preferences on signup
  Event.listen(AuthUserSignedUp, async (payload) => {
    const userId = payload.user_id;
    if (!userId) {
      logger.warn('AUTH_USER_SIGNED_UP event missing user_id');
      return;
    }

    try {
      await preferencesService.initializeUserPreferences(userId);
      logger.info('User preferences initialized with defaults', { userId });
    } catch (error) {
      logger.error('Failed to initialize user preferences', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - preferences can be initialized later if needed
    }
  });

  logger.info('Preferences event listeners registered');
};

// Direct named export for auto-generated bootstrap
export { registerPreferencesListeners };
