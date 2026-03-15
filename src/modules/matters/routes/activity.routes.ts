import { z } from '@hono/zod-openapi';
import { getActivityLogQuerySchema } from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const getMatterActivityRoute = routeBuilder.build({
  method: 'get',
  path: '/{id}/activity',
  tags,
  summary: 'Get matter activity log',
  request: {
    params: z.object({
      id: z.uuid(),
    }),
    query: getActivityLogQuerySchema,
  },
  responses: {
    200: {
      description: 'Activity log retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            activities: z.array(z.any()), // Activity schema is complex/dynamic in original code.
          }),
        },
      },
    },
  },
});
