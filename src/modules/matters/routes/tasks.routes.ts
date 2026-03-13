import { z } from '@hono/zod-openapi';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

const matterIdParamSchema = z.object({
  practice_id: z.uuid(),
  id: z.uuid(),
});

export const listMatterTasksRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/matters/{id}/tasks',
  tags,
  summary: 'List matter tasks (not implemented)',
  request: {
    params: matterIdParamSchema,
  },
  responses: {
    200: {
      description: 'Tasks retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            tasks: z.array(
              z.object({
                id: z.uuid(),
                title: z.string(),
                status: z.string(),
                due_date: z.string().nullable().optional(),
                assigned_to: z.uuid().nullable().optional(),
              })
            ),
          }),
        },
      },
    },
    501: {
      description: 'Matter tasks are not yet implemented',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});
