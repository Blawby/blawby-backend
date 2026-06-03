import { intakeTemplateValidations } from '@/modules/practice/validations/intake-templates.validation';
import { practiceValidations } from '@/modules/practice/validations/practice.validation';
import { routeBuilder } from '@/shared/router/route-builder';

const {
  practiceIdParamSchema,
  templateIdParamSchema,
  intakeTemplateListResponseSchema,
  intakeTemplateSingleResponseSchema,
  createIntakeTemplateSchema,
  updateIntakeTemplateSchema,
} = intakeTemplateValidations;
const { errorResponseSchema, notFoundResponseSchema, internalServerErrorResponseSchema } = practiceValidations;

export const listIntakeTemplatesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/intake-templates',
  tags: ['Intake Templates'],
  summary: 'List intake templates',
  description: 'List all intake templates for a practice.',
  request: { params: practiceIdParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: intakeTemplateListResponseSchema } },
      description: 'Templates retrieved successfully',
    },
    401: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Unauthorized' },
    500: {
      content: { 'application/json': { schema: internalServerErrorResponseSchema } },
      description: 'Internal server error',
    },
  },
});

export const createIntakeTemplateRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/intake-templates',
  tags: ['Intake Templates'],
  summary: 'Create intake template',
  description: 'Create a new intake template for a practice.',
  request: {
    params: practiceIdParamSchema,
    body: { content: { 'application/json': { schema: createIntakeTemplateSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: intakeTemplateSingleResponseSchema } },
      description: 'Template created successfully',
    },
    401: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Unauthorized' },
    409: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Conflict - slug already exists',
    },
    500: {
      content: { 'application/json': { schema: internalServerErrorResponseSchema } },
      description: 'Internal server error',
    },
  },
});

export const getIntakeTemplateRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/intake-templates/{id}',
  tags: ['Intake Templates'],
  summary: 'Get intake template',
  description: 'Get a single intake template by ID.',
  request: { params: templateIdParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: intakeTemplateSingleResponseSchema } },
      description: 'Template retrieved successfully',
    },
    401: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Unauthorized' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Template not found' },
    500: {
      content: { 'application/json': { schema: internalServerErrorResponseSchema } },
      description: 'Internal server error',
    },
  },
});

export const updateIntakeTemplateRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/intake-templates/{id}',
  tags: ['Intake Templates'],
  summary: 'Update intake template',
  description: 'Update an intake template. Providing fields replaces all fields for the template.',
  request: {
    params: templateIdParamSchema,
    body: { content: { 'application/json': { schema: updateIntakeTemplateSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: intakeTemplateSingleResponseSchema } },
      description: 'Template updated successfully',
    },
    401: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Unauthorized' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Template not found' },
    500: {
      content: { 'application/json': { schema: internalServerErrorResponseSchema } },
      description: 'Internal server error',
    },
  },
});

export const deleteIntakeTemplateRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/intake-templates/{id}',
  tags: ['Intake Templates'],
  summary: 'Delete intake template',
  description: 'Delete an intake template. The default template cannot be deleted.',
  request: { params: templateIdParamSchema },
  responses: {
    204: { description: 'Template deleted successfully' },
    401: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Unauthorized' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Template not found' },
    409: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Cannot delete the default template',
    },
    500: {
      content: { 'application/json': { schema: internalServerErrorResponseSchema } },
      description: 'Internal server error',
    },
  },
});
