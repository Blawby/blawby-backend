/**
 * Event Handlers Boot
 *
 * Registers all application event handlers using Laravel-style registration.
 */

import { bootstrapEventListeners } from '@/shared/events/bootstrap';

/**
 * Boot event handlers
 * Call this function to register all event handlers in the application.
 */
export const bootEventHandlers = async (): Promise<void> => {
  console.info('🚀 Registering event handlers...');

  await bootstrapEventListeners();

  console.info('✅ Event handlers registered successfully');
};
