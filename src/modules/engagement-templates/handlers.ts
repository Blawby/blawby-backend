import { HTTPException } from 'hono/http-exception';
import type { routes } from '@/modules/engagement-templates/routes';
import { engagementTemplateService } from '@/modules/engagement-templates/services/engagement-template.service';
import { engagementDraftService } from '@/modules/engagement-templates/services/engagement-draft.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const assertPracticeMatchesActiveOrg = (activeOrganizationId: string | null, practiceId: string): void => {
  if (!activeOrganizationId || practiceId !== activeOrganizationId) {
    throw new HTTPException(403, { message: 'Access denied: practice_id does not match your active organization' });
  }
};

const listEngagementTemplatesHandler: AppRouteHandler<typeof routes.listEngagementTemplatesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id: practiceId } = c.req.valid('param');
  assertPracticeMatchesActiveOrg(c.get('activeOrganizationId'), practiceId);

  const templates = await engagementTemplateService.listEngagementTemplates(practiceId, ctx);
  return c.json(templates);
};

const createEngagementTemplateHandler: AppRouteHandler<typeof routes.createEngagementTemplateRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id: practiceId } = c.req.valid('param');
  assertPracticeMatchesActiveOrg(c.get('activeOrganizationId'), practiceId);

  const body = c.req.valid('json');

  const template = await engagementTemplateService.createEngagementTemplate({ data: body }, ctx);
  return c.json(template, 201);
};

const updateEngagementTemplateHandler: AppRouteHandler<typeof routes.updateEngagementTemplateRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id: practiceId, template_id: id } = c.req.valid('param');
  assertPracticeMatchesActiveOrg(c.get('activeOrganizationId'), practiceId);

  const body = c.req.valid('json');

  const template = await engagementTemplateService.updateEngagementTemplate({ id, data: body }, ctx);
  return c.json(template);
};

const deleteEngagementTemplateHandler: AppRouteHandler<typeof routes.deleteEngagementTemplateRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id: practiceId, template_id: id } = c.req.valid('param');
  assertPracticeMatchesActiveOrg(c.get('activeOrganizationId'), practiceId);

  await engagementTemplateService.deleteEngagementTemplate({ id }, ctx);
  return c.body(null, 204);
};

const generateEngagementDraftHandler: AppRouteHandler<typeof routes.generateEngagementDraftRoute> = async (c) => {
  const { practice_id: practiceId, template_id: templateId } = c.req.valid('param');
  assertPracticeMatchesActiveOrg(c.get('activeOrganizationId'), practiceId);
  const { intake_id: intakeId } = c.req.valid('json');
  const ctx = getServiceContext(c);

  const draft = await engagementDraftService.generateEngagementDraft({ intakeId, templateId }, ctx);
  return c.json(draft, 200);
};

export const handlers = {
  listEngagementTemplatesHandler,
  createEngagementTemplateHandler,
  updateEngagementTemplateHandler,
  deleteEngagementTemplateHandler,
  generateEngagementDraftHandler,
};
