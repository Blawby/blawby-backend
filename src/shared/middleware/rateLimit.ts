/**
 * PostgreSQL-Based Rate Limiting Middleware
 *
 * Uses rate-limiter-flexible with PostgreSQL storage for distributed rate limiting.
 * Works across multiple server instances and prevents memory leaks.
 */

import { RateLimiterPostgres } from 'rate-limiter-flexible';
import type { MiddlewareHandler } from 'hono';
import { getPool } from '@/shared/database/connection';
import { response } from '@/shared/utils/responseUtils';

const DEFAULT_RATE_LIMIT_POINTS = 60;
const DEFAULT_RATE_LIMIT_DURATION_SECONDS = 60;

const limiters = new Map<string, RateLimiterPostgres>();

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
