/**
 * Application Boot
 *
 * Centralized application initialization
 */

import { isProductionLike } from '@/shared/utils/env';
import { bootEventHandlers } from './event-handlers';
import { bootServices } from './services';
import { bootWorkers } from './workers';
import { initializeRateLimiter } from '@/shared/middleware/rateLimit';

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
  bootEventHandlers();
};

/**
 * Boot the application
 * Call this after all modules are loaded but before starting the server
 */
export const bootApplication = async (): Promise<void> => {
  console.info('🚀 Starting application boot sequence...');

  // 1. Core initialization (Services & Events)
  bootCore();

  // 2. Initialize rate limiter (wait for PostgreSQL table to be ready)
  try {
    await initializeRateLimiter();
  } catch (error) {
    console.error('Failed to initialize rate limiter, continuing without it:', error);
    // Don't fail startup - rate limiting is non-critical
  }

  // 3. Start background workers
  // Note: Workers run as separate processes, this is just for API compatibility
  if (isProductionLike()) {
    bootWorkers();
  }

  console.info('✅ Application boot sequence completed');
};
