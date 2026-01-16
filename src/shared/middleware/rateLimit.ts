/**
 * PostgreSQL-Based Rate Limiting Middleware
 *
 * Uses rate-limiter-flexible with PostgreSQL storage for distributed rate limiting.
 * Works across multiple server instances and prevents memory leaks.
 *
 * Call `initializeRateLimiter()` during server boot to ensure the table is ready
 * before accepting requests.
 */

import { RateLimiterPostgres } from 'rate-limiter-flexible';
import type { MiddlewareHandler } from 'hono';
import { getPool } from '@/shared/database/connection';
import { response } from '@/shared/utils/responseUtils';

const DEFAULT_RATE_LIMIT_POINTS = 60;
const DEFAULT_RATE_LIMIT_DURATION_SECONDS = 60;

const limiters = new Map<string, RateLimiterPostgres>();

// Track if rate limiter has been initialized
let initialized = false;

// Pending initialization promise to prevent concurrent initialization attempts
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the rate limiter and wait for the PostgreSQL table to be ready.
 * Call this during server boot before accepting requests.
 *
 * This function is idempotent - multiple concurrent calls will return the same promise.
 */
export const initializeRateLimiter = (): Promise<void> => {
  // Already initialized - return immediately
  if (initialized) {
    return Promise.resolve();
  }

  // Initialization in progress - return the pending promise
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start new initialization
  initializationPromise = new Promise((resolve, reject) => {
    const key = `${DEFAULT_RATE_LIMIT_POINTS}:${DEFAULT_RATE_LIMIT_DURATION_SECONDS}`;

    const ready = (err?: Error) => {
      if (err) {
        console.error('Failed to initialize rate limiter:', err);
        initializationPromise = null; // Allow retry on failure
        reject(err);
      } else {
        initialized = true;
        console.info('✅ Rate limiter initialized (PostgreSQL table ready)');
        resolve();
      }
    };

    // Create the default limiter and wait for table to be ready
    const limiter = new RateLimiterPostgres(
      {
        storeClient: getPool(),
        points: DEFAULT_RATE_LIMIT_POINTS,
        duration: DEFAULT_RATE_LIMIT_DURATION_SECONDS,
        tableName: 'rate_limits',
        keyPrefix: 'rl:',
      },
      ready,
    );

    limiters.set(key, limiter);
  });

  return initializationPromise;
};

const getLimiter = (points: number, duration: number): RateLimiterPostgres => {
  const key = `${points}:${duration}`;

  if (!limiters.has(key)) {
    limiters.set(
      key,
      new RateLimiterPostgres({
        storeClient: getPool(),
        points,
        duration,
        tableName: 'rate_limits',
        keyPrefix: 'rl:',
        tableCreated: initialized, // Skip table check if already initialized
      })
    );
  }

  return limiters.get(key)!;
};

export const rateLimit = (options?: {
  points?: number;
  duration?: number;
  routeKey?: string;
}): MiddlewareHandler => {
  return async (c, next) => {
    const userId = c.get('userId');

    const ip =
      c.req.header('x-real-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown';

    const identifier = userId
      ? `user:${userId}`
      : `ip:${ip}`;

    const routeKey = options?.routeKey ?? 'global';
    const key = `${routeKey}:${identifier}`;

    const points = options?.points ?? DEFAULT_RATE_LIMIT_POINTS;
    const duration = options?.duration ?? DEFAULT_RATE_LIMIT_DURATION_SECONDS;

    const limiter = getLimiter(points, duration);

    try {
      await limiter.consume(key);
      return await next();
    } catch (rejRes: unknown) {
      // Only handle rate limit rejections - check for library-specific marker
      // rate-limiter-flexible rejects with an object containing msBeforeNext
      const isRateLimitRejection =
        rejRes &&
        typeof rejRes === 'object' &&
        'msBeforeNext' in rejRes &&
        typeof (rejRes as { msBeforeNext: unknown }).msBeforeNext === 'number';

      if (isRateLimitRejection) {
        // Rate limit exceeded - extract retry time
        const msBeforeNext = (rejRes as { msBeforeNext: number }).msBeforeNext;
        const retryAfter = Math.ceil(msBeforeNext / 1000) || 1;

        return response.tooManyRequests(
          c,
          `Too many requests. Please try again in ${retryAfter} seconds.`,
          retryAfter,
        );
      }

      // Not a rate limit rejection - likely a DB/connection error
      // Re-throw to be handled by global error handler
      throw rejRes;
    }
  };
};
