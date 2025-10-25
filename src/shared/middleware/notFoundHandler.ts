import type { NotFoundHandler } from 'hono';

/**
 * Not Found Handler for Hono Applications
 *
 * Handles 404 responses for routes that don't exist.
 */
export const notFoundHandler: NotFoundHandler = (c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: c.req.path,
    method: c.req.method,
  }, 404);
};
