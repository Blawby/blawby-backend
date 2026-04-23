import { createRoute, z } from '@hono/zod-openapi';
import { engagementContractValidations } from '@/modules/engagement-contracts/validations/engagement-contract.validation';

const createEngagementContractRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Engagement Contracts'],
  summary: 'Create a new engagement contract for a matter',
  request: {
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
    400: { description: 'Bad request' },
    403: { description: 'Forbidden' },
    404: { description: 'Matter not found' },
    409: { description: 'Conflict - matter already has active contract' },
  },
});

const listEngagementContractsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Engagement Contracts'],
  summary: 'List engagement contracts for the current practice',
  request: {
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
    403: { description: 'Forbidden' },
  },
});

const getEngagementContractRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Engagement Contracts'],
  summary: 'Get an engagement contract by ID',
  request: {
    params: engagementContractValidations.engagementContractIdParamSchema,
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
    403: { description: 'Forbidden' },
    404: { description: 'Engagement contract not found' },
  },
});

const updateEngagementContractRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Engagement Contracts'],
  summary: 'Update a draft engagement contract',
  request: {
    params: engagementContractValidations.engagementContractIdParamSchema,
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
    400: { description: 'Bad request' },
    403: { description: 'Forbidden' },
    404: { description: 'Engagement contract not found' },
    409: { description: 'Conflict - contract already sent' },
  },
});

const updateEngagementContractStatusRoute = createRoute({
  method: 'patch',
  path: '/{id}/status',
  tags: ['Engagement Contracts'],
  summary: 'Transition an engagement contract status (draft → sent, sent → accepted | declined)',
  request: {
    params: engagementContractValidations.engagementContractIdParamSchema,
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
    400: { description: 'Bad request - contract body cannot be empty when sending' },
    403: { description: 'Forbidden' },
    404: { description: 'Engagement contract not found' },
    409: { description: 'Conflict - invalid status transition' },
    500: { description: 'Failed to generate or upload PDF' },
  },
});

export const routes = {
  createEngagementContractRoute,
  listEngagementContractsRoute,
  getEngagementContractRoute,
  updateEngagementContractRoute,
  updateEngagementContractStatusRoute,
};
