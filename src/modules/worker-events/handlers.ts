/**
 * Worker Events Handlers
 *
 * Thin handlers that delegate to the worker-events service.
 */

import type { AppRouteHandler } from '@/shared/types/hono';
import type { ingestRoute } from '@/modules/worker-events/routes';
import { validateWorkerSecret, ingestWorkerEvent } from '@/modules/worker-events/services/worker-events.service';

export const ingestHandler: AppRouteHandler<typeof ingestRoute> = async (c) => {
  const secret = c.req.header('x-worker-secret');
  validateWorkerSecret(secret);

  const payload = c.req.valid('json');
  const result = await ingestWorkerEvent(payload);

  return c.json(result, 200);
};
