/**
 * Application Boot
 *
 * Centralized application initialization
 */

import { isProductionLike } from '@/shared/utils/env';
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
  // Note: Workers run as separate processes, this is just for API compatibility
  if (isProductionLike()) {
    bootWorkers();
  }

  console.info('✅ Application boot sequence completed');
};
