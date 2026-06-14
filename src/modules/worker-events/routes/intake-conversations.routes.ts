import { intakeConversationEventsPayloadSchema } from '@/modules/worker-events/types/worker-events.types';
import { routeBuilder } from '@/shared/router/route-builder';
import { z } from '@hono/zod-openapi';

export const ingestIntakeConversationsRoute = routeBuilder.build({
  method: 'post',
  path: '/intake-conversations',
  tags: ['Worker Events'],
  summary: 'Ingest intake conversation events from CF Worker queue',
  description:
    'Internal endpoint. Secured via Authorization: Bearer <api-key> header. Accepts batched events from the CF Worker consumer.',
  request: {
    headers: z.object({
      authorization: z.string().regex(/^[Bb]earer\s+\S+$/).openapi({ description: 'Bearer token: Authorization: Bearer <api-key>' }),
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
