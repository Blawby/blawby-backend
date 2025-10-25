/**
 * Application Boot
 *
 * Centralized application initialization
 */

import { bootEventHandlers } from './event-handlers';
import { bootServices } from './services';
import { bootWorkers } from './workers';

/**
 * Boot the application
 * Call this after all modules are loaded but before starting the server
 */
export const bootApplication = (): void => {
  console.info('🚀 Starting application boot sequence...');

  // 1. Initialize external services
  bootServices();

  // 2. Register event handlers
  bootEventHandlers();

  // 3. Start background workers
  if (process.env.NODE_ENV === 'production') {
    bootWorkers();
  }

  console.info('✅ Application boot sequence completed');
};
