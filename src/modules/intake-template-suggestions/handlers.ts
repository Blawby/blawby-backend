import type {
  approveSuggestionRoute,
  dismissSuggestionRoute,
  listSuggestionsRoute,
  stageSuggestionRoute,
} from '@/modules/intake-template-suggestions/routes';
import { intakeTemplateSuggestionsService } from '@/modules/practice/services/intake-template-suggestions.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

export const listSuggestionsHandler: AppRouteHandler<typeof listSuggestionsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { template_id } = c.req.valid('param');
  return c.json(
    await intakeTemplateSuggestionsService.listSuggestions(
      { organizationId: ctx.organizationId, templateId: template_id },
      ctx
    ),
    200
  );
};

export const stageSuggestionHandler: AppRouteHandler<typeof stageSuggestionRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { template_id } = c.req.valid('param');
  const suggestion = await intakeTemplateSuggestionsService.stageSuggestion(
    { organizationId: ctx.organizationId, templateId: template_id, data: c.req.valid('json') },
    ctx
  );
  return c.json({ suggestion }, 201);
};

export const approveSuggestionHandler: AppRouteHandler<typeof approveSuggestionRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { template_id, suggestion_id } = c.req.valid('param');
  const { expected_revision } = c.req.valid('json');
  const result = await intakeTemplateSuggestionsService.approveSuggestion(
    {
      organizationId: ctx.organizationId,
      templateId: template_id,
      suggestionId: suggestion_id,
      expectedRevision: expected_revision,
    },
    ctx
  );
  return c.json(result, 200);
};

export const dismissSuggestionHandler: AppRouteHandler<typeof dismissSuggestionRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { template_id, suggestion_id } = c.req.valid('param');
  const suggestion = await intakeTemplateSuggestionsService.dismissSuggestion(
    { organizationId: ctx.organizationId, templateId: template_id, suggestionId: suggestion_id },
    ctx
  );
  return c.json({ suggestion }, 200);
};

export const handlers = {
  listSuggestionsHandler,
  stageSuggestionHandler,
  approveSuggestionHandler,
  dismissSuggestionHandler,
};
