import { z } from '@hono/zod-openapi';
import { engagementTemplateService } from '@/modules/engagement-templates/services/engagement-template.service';
import { engagementTemplateValidations } from '@/modules/engagement-templates/validations/engagement-template.validation';
import { routeBuilder } from '@/shared/router/route-builder';
import {
  errorResponseSchema,
  forbiddenResponseSchema,
  notFoundResponseSchema,
  practiceIdParamSchema,
  unauthorizedResponseSchema,
} from '@/shared/validations/openapi';

const engagementTemplateParamSchema = practiceIdParamSchema.extend({
  template_id: z.uuid().openapi({
    param: { name: 'template_id', in: 'path' },
    description: 'Engagement Template ID (UUID)',
  }),
});

const listEngagementTemplatesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Engagement Templates'],
  summary: 'List engagement templates for a practice',
  mcp: {
    name: 'list_engagement_templates',
    scope: 'engagement_templates:read',
    handler: async (_args, ctx) => engagementTemplateService.listEngagementTemplates(ctx.organizationId, ctx),
  },
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(engagementTemplateValidations.engagementTemplateSchema),
        },
      },
      description: 'List of engagement templates',
    },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
  },
});

const createEngagementTemplateRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}',
  tags: ['Engagement Templates'],
  summary: 'Create a new engagement template for a practice',
  mcp: {
    name: 'create_engagement_template',
    scope: 'engagement_templates:write',
    schema: engagementTemplateValidations.createEngagementTemplateSchema.shape,
    handler: async (args, ctx) =>
      engagementTemplateService.createEngagementTemplate(
        { data: args as Parameters<typeof engagementTemplateService.createEngagementTemplate>[0]['data'] },
        ctx
      ),
  },
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: engagementTemplateValidations.createEngagementTemplateSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: engagementTemplateValidations.engagementTemplateSchema,
        },
      },
      description: 'Engagement template created',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Bad request' },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
  },
});

const updateEngagementTemplateRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}/{template_id}',
  tags: ['Engagement Templates'],
  summary: 'Update an engagement template',
  mcp: {
    name: 'update_engagement_template',
    scope: 'engagement_templates:write',
    schema: {
      template_id: z.uuid(),
      ...engagementTemplateValidations.updateEngagementTemplateSchema.shape,
    },
    handler: async (args, ctx) => {
      const { template_id, ...data } = args;
      return engagementTemplateService.updateEngagementTemplate(
        {
          id: template_id as string,
          data: data as Parameters<typeof engagementTemplateService.updateEngagementTemplate>[0]['data'],
        },
        ctx
      );
    },
  },
  request: {
    params: engagementTemplateParamSchema,
    body: {
      content: {
        'application/json': {
          schema: engagementTemplateValidations.updateEngagementTemplateSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: engagementTemplateValidations.engagementTemplateSchema,
        },
      },
      description: 'Engagement template updated',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Bad request' },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
    404: {
      content: { 'application/json': { schema: notFoundResponseSchema } },
      description: 'Engagement template not found',
    },
  },
});

const deleteEngagementTemplateRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/{template_id}',
  tags: ['Engagement Templates'],
  summary: 'Delete an engagement template',
  mcp: {
    name: 'delete_engagement_template',
    scope: 'engagement_templates:write',
    schema: { template_id: z.uuid() },
    approval: {
      required: true,
      message: 'Delete this engagement template?',
      confirm_title: 'Delete engagement template',
    },
    handler: async (args, ctx) =>
      engagementTemplateService.deleteEngagementTemplate({ id: args.template_id as string }, ctx),
  },
  request: {
    params: engagementTemplateParamSchema,
  },
  responses: {
    204: { description: 'Engagement template deleted' },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
    404: {
      content: { 'application/json': { schema: notFoundResponseSchema } },
      description: 'Engagement template not found',
    },
  },
});

export const routes = {
  listEngagementTemplatesRoute,
  createEngagementTemplateRoute,
  updateEngagementTemplateRoute,
  deleteEngagementTemplateRoute,
};
