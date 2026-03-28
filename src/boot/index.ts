/**
 * Application Boot
 *
 * Centralized application initialization
 */

import { bootEventHandlers } from '@/boot/event-handlers';
import { bootServices } from '@/boot/services';
import { bootWorkers } from '@/boot/workers';
import { rateLimiter } from '@/shared/middleware/rateLimit';
import { initializeLogging } from '@/shared/logging/config';

/**
 * Core Boot
 *
 * Shared initialization for API, Workers, and CLI scripts.
 * Use this when you only need services and event handlers.
 */
export const bootCore = (): void => {
  // 1. Initialize external services
  bootServices();

  // 2. Register event handlers
  void bootEventHandlers();
};

/**
 * Boot the application
 * Call this after all modules are loaded but before starting the server
 */
export const bootApplication = async (): Promise<void> => {
  console.info('🚀 Starting application boot sequence...');

  // 0. Initialize logging system
  await initializeLogging();

  // 1. Core initialization (Services & Events)
  bootCore();

  // 2. Initialize rate limiter (wait for PostgreSQL table to be ready)
  try {
    await rateLimiter.initialize();
  } catch (error) {
    console.error('Failed to initialize rate limiter, continuing without it:', error);
    // Don't fail startup - rate limiting is non-critical
  }

  // 3. Start background workers (API compatibility)
  bootWorkers();

  console.info('✅ Application boot sequence completed');
};
