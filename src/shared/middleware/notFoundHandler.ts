import type { NotFoundHandler } from 'hono';
import { response } from '@/shared/utils/responseUtils';

/**
 * Not Found Handler for Hono Applications
 *
 * Handles 404 responses for routes that don't exist.
 */
export const notFoundHandler: NotFoundHandler = (c) => {
  return response.notFound(c, `The requested resource ${c.req.path} was not found`);
};
