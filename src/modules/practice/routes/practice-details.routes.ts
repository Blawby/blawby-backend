import { z } from '@hono/zod-openapi';
import { practiceValidations } from '@/modules/practice/validations/practice.validation';
import { routeBuilder } from '@/shared/router/route-builder';

const practiceIdParamSchema = z.object({
  practice_id: z.uuid().openapi({
    param: {
      name: 'practice_id',
      in: 'path',
    },
    description: 'Practice ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

export const getPracticeDetailsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/details',
  tags: ['Practice'],
  summary: 'Get practice details',
  description: 'Retrieve practice details for a specific practice',
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceDetailsSingleResponseSchema,
        },
      },
      description: 'Practice details retrieved successfully',
    },
  },
});

export const createPracticeDetailsRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/details',
  tags: ['Practice'],
  summary: 'Create practice details',
  description: 'Create practice details for a practice',
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: practiceValidations.createPracticeDetailsSchema,
        },
      },
      description: 'Practice details data',
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceDetailsCreateResponseSchema,
        },
      },
      description: 'Practice details created successfully',
    },
  },
});

export const updatePracticeDetailsRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/details',
  tags: ['Practice'],
  summary: 'Update practice details',
  description: "Update practice details for a practice (creates if doesn't exist)",
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: practiceValidations.updatePracticeDetailsSchema,
        },
      },
      description: 'Practice details update data',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceDetailsUpdateResponseSchema,
        },
      },
      description: 'Practice details updated successfully',
    },
  },
});

export const deletePracticeDetailsRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/details',
  tags: ['Practice'],
  summary: 'Delete practice details',
  description: 'Delete practice details for a practice',
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    204: {
      description: 'Practice details deleted successfully',
    },
  },
});

export const getPracticeDetailsBySlugRoute = routeBuilder.build({
  method: 'get',
  path: '/details/{slug}',
  tags: ['Practice'],
  summary: 'Get practice details by slug',
  description: 'Retrieve practice details by slug (Public endpoint)',
  request: {
    params: z.object({
      slug: z.string().openapi({
        param: {
          name: 'slug',
          in: 'path',
        },
        description: 'Practice Slug',
        example: 'my-legal-practice',
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceDetailsSingleResponseSchema,
        },
      },
      description: 'Practice details retrieved successfully',
    },
  },
});
