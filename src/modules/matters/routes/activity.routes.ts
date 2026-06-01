import { z } from '@hono/zod-openapi';
import { getActivityCountQuerySchema, getActivityLogQuerySchema } from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const getMatterActivityRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/activity',
  tags,
  summary: 'Get matter activity log',
  request: {
    params: z.object({
      matter_id: z.uuid(),
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

export const getMatterActivityCountRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/activity/count',
  tags,
  summary: 'Get matter activity count since a timestamp',
  request: {
    params: z.object({
      matter_id: z.uuid(),
    }),
    query: getActivityCountQuerySchema,
  },
  responses: {
    200: {
      description: 'Activity count retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            count: z.number().int().nonnegative(),
          }),
        },
      },
    },
  },
});
