import { HTTPException } from 'hono/http-exception';
import { routes } from '@/modules/engagement-templates/routes';
import { engagementTemplateService } from '@/modules/engagement-templates/services/engagement-template.service';
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

export const handlers = {
  listEngagementTemplatesHandler,
  createEngagementTemplateHandler,
  updateEngagementTemplateHandler,
  deleteEngagementTemplateHandler,
};
