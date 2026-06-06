import { z } from '@hono/zod-openapi';
import { engagementContractValidations } from '@/modules/engagement-contracts/validations/engagement-contract.validation';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { routeBuilder } from '@/shared/router/route-builder';
import {
  errorResponseSchema,
  forbiddenResponseSchema,
  notFoundResponseSchema,
  practiceIdParamSchema,
  unauthorizedResponseSchema,
} from '@/shared/validations/openapi';

const engagementContractParamSchema = practiceIdParamSchema.extend({
  contract_id: z.uuid().openapi({
    param: { name: 'contract_id', in: 'path' },
    description: 'Engagement Contract ID (UUID)',
  }),
});

const createEngagementContractRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}',
  tags: ['Engagement Contracts'],
  summary: 'Create a new engagement contract for a matter',
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: engagementContractValidations.createEngagementContractSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: engagementContractValidations.engagementContractSchema,
        },
      },
      description: 'Engagement contract created',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Bad request' },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Matter not found' },
    409: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Conflict - matter already has active contract',
    },
  },
});

const listEngagementContractsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Engagement Contracts'],
  summary: 'List engagement contracts for a practice',
  request: {
    params: practiceIdParamSchema,
    query: engagementContractValidations.listEngagementContractsQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(engagementContractValidations.engagementContractSchema),
            pagination: z.object({
              page: z.number(),
              limit: z.number(),
              total: z.number(),
            }),
          }),
        },
      },
      description: 'List of engagement contracts',
    },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
  },
});

const getEngagementContractRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{contract_id}',
  middleware: [requireAuth(), injectAbility()] as const,
  tags: ['Engagement Contracts'],
  summary: 'Get an engagement contract by ID',
  request: {
    params: engagementContractParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: engagementContractValidations.engagementContractSchema,
        },
      },
      description: 'Engagement contract details',
    },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
    404: {
      content: { 'application/json': { schema: notFoundResponseSchema } },
      description: 'Engagement contract not found',
    },
  },
});

const updateEngagementContractRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}/{contract_id}',
  tags: ['Engagement Contracts'],
  summary: 'Update a draft engagement contract',
  request: {
    params: engagementContractParamSchema,
    body: {
      content: {
        'application/json': {
          schema: engagementContractValidations.updateEngagementContractSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: engagementContractValidations.engagementContractSchema,
        },
      },
      description: 'Engagement contract updated',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Bad request' },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
    404: {
      content: { 'application/json': { schema: notFoundResponseSchema } },
      description: 'Engagement contract not found',
    },
    409: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Conflict - contract already sent',
    },
  },
});

const updateEngagementContractStatusRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}/{contract_id}/status',
  tags: ['Engagement Contracts'],
  summary: 'Transition an engagement contract status (draft → sent, sent → accepted | declined)',
  request: {
    params: engagementContractParamSchema,
    body: {
      content: {
        'application/json': {
          schema: engagementContractValidations.updateEngagementContractStatusSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: engagementContractValidations.engagementContractSchema,
        },
      },
      description: 'Engagement contract status updated',
    },
    400: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Bad request - contract body cannot be empty when sending',
    },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
    404: {
      content: { 'application/json': { schema: notFoundResponseSchema } },
      description: 'Engagement contract not found',
    },
    409: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Conflict - invalid status transition',
    },
    500: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Failed to generate or upload PDF',
    },
  },
});

export const routes = {
  createEngagementContractRoute,
  listEngagementContractsRoute,
  getEngagementContractRoute,
  updateEngagementContractRoute,
  updateEngagementContractStatusRoute,
};
