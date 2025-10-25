import type { MiddlewareHandler } from 'hono';
import { cors as honoCors } from 'hono/cors';

/**
 * Hono CORS Middleware
 *
 * Provides CORS handling similar to Fastify's @fastify/cors.
 * Uses Hono's built-in CORS middleware with our configuration.
 */
export const cors = (): MiddlewareHandler => {
  return honoCors({
    origin: (origin) => {
      // Allow same-origin requests
      if (!origin) return origin;

      // Allow localhost in development
      if (process.env.NODE_ENV === 'development') {
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
          return origin;
        }
      }

      // In production, configure allowed origins
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      if (allowedOrigins.includes(origin)) {
        return origin;
      }

      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
  });
};
