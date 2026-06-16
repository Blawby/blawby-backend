import { z } from '@hono/zod-openapi';
import { routeBuilder } from '@/shared/router/route-builder';
import { workerEventsValidation } from '@/modules/worker-events/validations/worker-events.validation';

export const ingestRoute = routeBuilder.build({
  method: 'post',
  path: '/ingest',
  tags: ['Worker Events'],
  summary: 'Ingest a worker event',
  description:
    'Internal endpoint for external workers to dispatch events into the backend event pipeline. No session auth — secured via Authorization: Bearer <api-key> header. Supports idempotent replay via event_id.',
  request: {
    headers: z.object({
      authorization: z
        .string()
        .regex(/^[Bb]earer\s+\S+$/)
        .openapi({
          description: 'Bearer token: Authorization: Bearer <api-key>',
        }),
    }),
    body: {
      content: {
        'application/json': {
          schema: workerEventsValidation.payloadSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Event accepted or duplicate',
      content: {
        'application/json': {
          schema: workerEventsValidation.responseSchema,
        },
      },
    },
  },
});
