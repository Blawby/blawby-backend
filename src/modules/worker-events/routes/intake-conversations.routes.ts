import { intakeConversationEventsPayloadSchema } from '@/modules/worker-events/types/worker-events.types';
import { routeBuilder } from '@/shared/router/route-builder';
import { z } from '@hono/zod-openapi';

export const ingestIntakeConversationsRoute = routeBuilder.build({
  method: 'post',
  path: '/intake-conversations',
  tags: ['Worker Events'],
  summary: 'Ingest intake conversation events from CF Worker queue',
  description:
    'Internal endpoint. Secured via x-worker-secret header. Accepts batched events from the CF Worker consumer.',
  request: {
    headers: z.object({
      'x-worker-secret': z.string().openapi({ description: 'Shared secret for worker authentication' }),
    }),
    body: { content: { 'application/json': { schema: intakeConversationEventsPayloadSchema } } },
  },
  responses: {
    200: {
      description: 'Events processed',
      content: { 'application/json': { schema: z.object({ processed: z.number(), skipped: z.number() }) } },
    },
  },
});
