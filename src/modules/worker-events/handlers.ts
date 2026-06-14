import type { AppRouteHandler } from '@/shared/types/hono';
import type { ingestRoute, ingestIntakeConversationsRoute } from '@/modules/worker-events/routes';
import { workerEventsService } from '@/modules/worker-events/services/worker-events.service';

export const ingestHandler: AppRouteHandler<typeof ingestRoute> = async (c) => {
  const payload = c.req.valid('json');
  const result = await workerEventsService.ingestWorkerEvent(payload);
  return c.json(result, 200);
};

export const ingestIntakeConversationsHandler: AppRouteHandler<typeof ingestIntakeConversationsRoute> = async (c) => {
  const payload = c.req.valid('json');
  const result = await workerEventsService.ingestIntakeConversationEvents(payload);
  return c.json(result, 200);
};
