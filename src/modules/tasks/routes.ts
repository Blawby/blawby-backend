import { z } from '@hono/zod-openapi';
import { matterTaskResponseSchema } from '@/modules/matters/types/matter.types';
import { matterTaskValidations } from '@/modules/matters/validations/matter-tasks.validation';
import { routeBuilder } from '@/shared/router/route-builder';
import { paginationSchema as paginationQuerySchema, uuidValidator } from '@/shared/validations/common';
import { paginationSchema as paginationResponseSchema } from '@/shared/validations/openapi';

const practiceIdParams = z.object({ practice_id: uuidValidator });

export const listPracticeTasksQuery = z.object({
  task_id: uuidValidator.optional(),
  assignee_id: uuidValidator.optional(),
  status: matterTaskValidations.taskStatusEnum.optional(),
  priority: matterTaskValidations.taskPriorityEnum.optional(),
  stage: z.string().trim().min(1).max(100).optional(),
  due_before: z.iso.date().optional(),
  ...paginationQuerySchema.shape,
});

export const listPracticeTasksRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Tasks'],
  summary: 'List tasks across a practice',
  description:
    'Returns bounded, filterable matter tasks for the authenticated practice. Practice scope comes from the authenticated service context; the path identifier must match that membership.',
  request: {
    params: practiceIdParams,
    query: listPracticeTasksQuery,
  },
  responses: {
    200: {
      description: 'Practice tasks retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(matterTaskResponseSchema),
            pagination: paginationResponseSchema,
          }),
        },
      },
    },
  },
});
