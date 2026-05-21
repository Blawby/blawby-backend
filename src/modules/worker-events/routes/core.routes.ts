import { z } from '@hono/zod-openapi';
import { routeBuilder } from '@/shared/router/route-builder';
import { workerEventsValidation } from '@/modules/worker-events/validations/worker-events.validation';

export const ingestRoute = routeBuilder.build({
  method: 'post',
  path: '/ingest',
  tags: ['Worker Events'],
  summary: 'Ingest a worker event',
  description:
    'Internal endpoint for external workers to dispatch events into the backend event pipeline. No session auth — secured via x-worker-secret shared-secret header instead. Supports idempotent replay via event_id.',
  request: {
    headers: z.object({
      'x-worker-secret': z.string().openapi({
        description: 'Shared secret for worker authentication',
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
