import { z } from '@hono/zod-openapi';
import { routeBuilder } from '@/shared/router/route-builder';
import { errorResponseSchema } from '@/shared/validations/openapi';

const tags = ['Matters'];

export const getMatterUnbilledRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/unbilled',
  tags,
  summary: 'Get unbilled time entries, expenses, and milestones for a matter',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Unbilled items retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            time_entries: z.array(
              z.object({
                id: z.uuid(),
                description: z.string().nullable(),
                duration_minutes: z.number(),
                hourly_rate: z.number(),
                total: z.number(),
                created_at: z.string(),
                user_id: z.uuid().nullable().optional(),
              })
            ),
            expenses: z.array(
              z.object({
                id: z.uuid(),
                description: z.string().nullable(),
                amount: z.number(),
                created_at: z.string(),
              })
            ),
            milestones: z.array(
              z.object({
                id: z.uuid(),
                description: z.string().nullable(),
                amount: z.number(),
                status: z.string(),
                due_date: z.string().nullable().optional(),
                order: z.number(),
              })
            ),
            connected_account_id: z.uuid().nullable(),
          }),
        },
      },
    },
    403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponseSchema } } },
    404: { description: 'Matter not found', content: { 'application/json': { schema: errorResponseSchema } } },
    500: { description: 'Internal server error', content: { 'application/json': { schema: errorResponseSchema } } },
  },
});
