import { intakeTemplateSuggestionsService } from '@/modules/practice/services/intake-template-suggestions.service';
import { intakeTemplateValidations } from '@/modules/practice/validations/intake-templates.validation';
import { routeBuilder } from '@/shared/router/route-builder';
import { z } from '@hono/zod-openapi';

const templateParamsSchema = z.object({ practice_id: z.uuid(), template_id: z.uuid() });
const suggestionParamsSchema = templateParamsSchema.extend({ suggestion_id: z.uuid() });
const suggestionResponseSchema = z.object({ suggestion: intakeTemplateValidations.intakeTemplateSuggestionSchema });
const approvalResponseSchema = suggestionResponseSchema.extend({
  template: intakeTemplateValidations.intakeTemplateSchema,
});

export const listSuggestionsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/intake-templates/{template_id}/suggestions',
  tags: ['Intake Template Suggestions'],
  summary: 'List staged intake-template suggestions',
  mcp: {
    name: 'list_intake_template_suggestions',
    scope: 'practice:read',
    schema: { template_id: z.uuid() },
    handler: async (args, ctx) =>
      intakeTemplateSuggestionsService.listSuggestions(
        { organizationId: ctx.organizationId, templateId: z.uuid().parse(args.template_id) },
        ctx
      ),
  },
  request: { params: templateParamsSchema },
  responses: {
    200: {
      description: 'Suggestions retrieved',
      content: {
        'application/json': {
          schema: z.object({ suggestions: z.array(intakeTemplateValidations.intakeTemplateSuggestionSchema) }),
        },
      },
    },
  },
});

export const stageSuggestionRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/intake-templates/{template_id}/suggestions',
  tags: ['Intake Template Suggestions'],
  summary: 'Stage structured AI-authored template edits',
  description: 'Persists validated proposal edits. Suggestions remain inert until explicitly approved.',
  mcp: {
    name: 'stage_intake_template_suggestion',
    scope: 'practice:write',
    schema: {
      template_id: z.uuid(),
      ...intakeTemplateValidations.createIntakeTemplateSuggestionSchema.shape,
    },
    handler: async (args, ctx) => {
      const parsed = intakeTemplateValidations.createIntakeTemplateSuggestionSchema.parse(args);
      return intakeTemplateSuggestionsService.stageSuggestion(
        { organizationId: ctx.organizationId, templateId: z.uuid().parse(args.template_id), data: parsed },
        ctx
      );
    },
  },
  request: {
    params: templateParamsSchema,
    body: {
      content: { 'application/json': { schema: intakeTemplateValidations.createIntakeTemplateSuggestionSchema } },
    },
  },
  responses: {
    201: { description: 'Suggestion staged', content: { 'application/json': { schema: suggestionResponseSchema } } },
  },
});

export const approveSuggestionRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/intake-templates/{template_id}/suggestions/{suggestion_id}/approve',
  tags: ['Intake Template Suggestions'],
  summary: 'Approve and atomically apply a staged suggestion',
  mcp: {
    name: 'approve_intake_template_suggestion',
    scope: 'practice:write',
    approval: {
      required: true,
      message: 'Approve applying these staged intake-template edits?',
      confirm_title: 'Apply template edits',
    },
    schema: {
      template_id: z.uuid(),
      suggestion_id: z.uuid(),
      ...intakeTemplateValidations.decideIntakeTemplateSuggestionSchema.shape,
    },
    handler: async (args, ctx) => {
      const decision = intakeTemplateValidations.decideIntakeTemplateSuggestionSchema.parse(args);
      return intakeTemplateSuggestionsService.approveSuggestion(
        {
          organizationId: ctx.organizationId,
          templateId: z.uuid().parse(args.template_id),
          suggestionId: z.uuid().parse(args.suggestion_id),
          expectedRevision: decision.expected_revision,
        },
        ctx
      );
    },
  },
  request: {
    params: suggestionParamsSchema,
    body: {
      content: { 'application/json': { schema: intakeTemplateValidations.decideIntakeTemplateSuggestionSchema } },
    },
  },
  responses: {
    200: { description: 'Suggestion applied', content: { 'application/json': { schema: approvalResponseSchema } } },
  },
});

export const dismissSuggestionRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/intake-templates/{template_id}/suggestions/{suggestion_id}/dismiss',
  tags: ['Intake Template Suggestions'],
  summary: 'Dismiss a staged suggestion',
  mcp: {
    name: 'dismiss_intake_template_suggestion',
    scope: 'practice:write',
    schema: { template_id: z.uuid(), suggestion_id: z.uuid() },
    handler: async (args, ctx) =>
      intakeTemplateSuggestionsService.dismissSuggestion(
        {
          organizationId: ctx.organizationId,
          templateId: z.uuid().parse(args.template_id),
          suggestionId: z.uuid().parse(args.suggestion_id),
        },
        ctx
      ),
  },
  request: { params: suggestionParamsSchema },
  responses: {
    200: { description: 'Suggestion dismissed', content: { 'application/json': { schema: suggestionResponseSchema } } },
  },
});

export const routes = { listSuggestionsRoute, stageSuggestionRoute, approveSuggestionRoute, dismissSuggestionRoute };
