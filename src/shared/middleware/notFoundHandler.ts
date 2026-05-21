import type { NotFoundHandler } from 'hono';

/**
 * Not Found Handler for Hono Applications
 *
 * Handles 404 responses for routes that don't exist.
 */
export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(
    {
      error: 'Not Found',
      message: `The requested resource ${c.req.path} was not found`,
      request_id: c.get('requestId'),
    },
    404
  );
