/**
 * Application Boot
 *
 * Centralized application initialization
 */

import { bootEventHandlers } from './event-handlers';
import { bootServices } from './services';
import { initializeRateLimiter } from '@/shared/middleware/rateLimit';

/**
 * Boot the application
 * Call this after all modules are loaded but before starting the server
 */
export const bootApplication = async (): Promise<void> => {
  console.info('🚀 Starting application boot sequence...');

  // 1. Initialize external services
  bootServices();

  // 2. Initialize rate limiter (wait for PostgreSQL table to be ready)
  try {
    await initializeRateLimiter();
  } catch (error) {
    console.error('Failed to initialize rate limiter, continuing without it:', error);
    // Don't fail startup - rate limiting is non-critical
  }

  // 3. Register event handlers
  bootEventHandlers();

  console.info('✅ Application boot sequence completed');
};
