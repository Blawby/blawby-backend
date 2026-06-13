import type { AppRouteHandler } from '@/shared/types/hono';
import type { ingestRoute, ingestIntakeConversationsRoute } from '@/modules/worker-events/routes';
import { workerEventsService } from '@/modules/worker-events/services/worker-events.service';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { HTTPException } from 'hono/http-exception';

const verifyApiKey = async (authHeader: string | undefined): Promise<void> => {
  const key = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  if (!key) {
    throw new HTTPException(401, { message: 'Missing API key' });
  }
  const { valid } = await createBetterAuthInstance(db).api.verifyApiKey({ body: { key } });
  if (!valid) {
    throw new HTTPException(401, { message: 'Invalid API key' });
  }
};

export const ingestHandler: AppRouteHandler<typeof ingestRoute> = async (c) => {
  await verifyApiKey(c.req.header('authorization'));

  const payload = c.req.valid('json');
  const result = await workerEventsService.ingestWorkerEvent(payload);

  return c.json(result, 200);
};

export const ingestIntakeConversationsHandler: AppRouteHandler<typeof ingestIntakeConversationsRoute> = async (c) => {
  await verifyApiKey(c.req.header('authorization'));

  const payload = c.req.valid('json');
  const result = await workerEventsService.ingestIntakeConversationEvents(payload);
  return c.json(result, 200);
};
