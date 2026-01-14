/**
 * Hono Middleware Collection
 *
 * Middleware functions that parallel our Fastify middleware setup.
 * These provide the same functionality but using Hono's patterns.
 */

export { logger } from '@/shared/middleware/logger';
export { cors } from '@/shared/middleware/cors';
export {
  requireAuth, requireGuest, requireAdmin,
} from '@/shared/middleware/requireAuth';
export { rateLimit } from '@/shared/middleware/rateLimit';
export { responseMiddleware } from '@/shared/middleware/responseMiddleware';
export { errorHandler } from '@/shared/middleware/errorHandler';
export { notFoundHandler } from '@/shared/middleware/notFoundHandler';
