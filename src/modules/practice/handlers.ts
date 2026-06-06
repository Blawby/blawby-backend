import type { routes } from '@/modules/practice/routes';
import { conflictCheckService } from '@/modules/practice/services/conflict-check.service';
import { memberProfilesService } from '@/modules/practice/services/member-profiles.service';
import { intakeTemplatesService } from '@/modules/practice/services/intake-templates.service';
import { practiceDetailsManagementService } from '@/modules/practice/services/practice-details-management.service';
import { practiceManagementService } from '@/modules/practice/services/practice-management.service';
import { practiceQueriesService } from '@/modules/practice/services/practice-queries.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';

export const listPracticesHandler: AppRouteHandler<typeof routes.listPracticesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const result = await practiceQueriesService.listPractices(ctx);
  return c.json(result);
};

export const createPracticeHandler: AppRouteHandler<typeof routes.createPracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const validatedBody = c.req.valid('json');
  const result = await practiceManagementService.createPractice(
    {
      data: validatedBody,
    },
    ctx
  );
  return c.json(result, 201);
};

export const getPracticeHandler: AppRouteHandler<typeof routes.getPracticeByIdRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const result = await practiceQueriesService.getPracticeById({ organizationId: practice_id }, ctx);
  return c.json(result);
};

export const updatePracticeHandler: AppRouteHandler<typeof routes.updatePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceManagementService.updatePractice(
    {
      organizationId: practice_id,
      data: validatedBody,
    },
    ctx
  );
  return c.json(result);
};

export const deletePracticeHandler: AppRouteHandler<typeof routes.deletePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  await practiceDetailsManagementService.deletePractice({ organizationId: practice_id }, ctx);
  return c.body(null, 204);
};

export const setActivePracticeHandler: AppRouteHandler<typeof routes.setActivePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  await practiceDetailsManagementService.setActivePractice({ organizationId: practice_id }, ctx);
  return c.json({ success: true });
};

export const getPracticeDetailsHandler: AppRouteHandler<typeof routes.getPracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const result = await practiceQueriesService.getPracticeDetails({ organizationId: practice_id }, ctx);
  return c.json(result);
};

export const createPracticeDetailsHandler: AppRouteHandler<typeof routes.createPracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceDetailsManagementService.upsertPracticeDetails(
    {
      organizationId: practice_id,
      data: validatedBody,
    },
    ctx
  );
  return c.json(result, 201);
};

export const updatePracticeDetailsHandler: AppRouteHandler<typeof routes.updatePracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceDetailsManagementService.upsertPracticeDetails(
    {
      organizationId: practice_id,
      data: validatedBody,
    },
    ctx
  );
  return c.json(result);
};

export const deletePracticeDetailsHandler: AppRouteHandler<typeof routes.deletePracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  await practiceDetailsManagementService.deletePracticeDetails({ organizationId: practice_id }, ctx);
  return c.body(null, 204);
};

export const conflictCheckHandler: AppRouteHandler<typeof routes.conflictCheckRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');
  const result = await conflictCheckService.runConflictCheck({ data: body }, ctx);
  return c.json(result);
};

export const getPracticeDetailsBySlugHandler: AppRouteHandler<typeof routes.getPracticeDetailsBySlugRoute> = async (
  c
) => {
  const ctx = getServiceContext(c);
  const { slug } = c.req.valid('param');
  const result = await practiceQueriesService.getPracticeBySlug({ slug }, ctx);
  return c.json(result);
};

export const getMemberProfileHandler: AppRouteHandler<typeof routes.getMemberProfileRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id, user_id } = c.req.valid('param');
  if (practice_id !== ctx.organizationId) {
    throw new HTTPException(400, { message: 'practice_id must match your current organization' });
  }
  const result = await memberProfilesService.getProfile({ userId: user_id }, ctx);
  return c.json(result);
};

export const updateMemberProfileHandler: AppRouteHandler<typeof routes.updateMemberProfileRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id, user_id } = c.req.valid('param');
  if (practice_id !== ctx.organizationId) {
    throw new HTTPException(400, { message: 'practice_id must match your current organization' });
  }
  const body = c.req.valid('json');
  const result = await memberProfilesService.upsertProfile({ userId: user_id, data: body }, ctx);
  return c.json(result);
};

export const listIntakeTemplatesHandler: AppRouteHandler<typeof routes.listIntakeTemplatesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const result = await intakeTemplatesService.listTemplates({ organizationId: practice_id }, ctx);
  return c.json(result);
};

export const createIntakeTemplateHandler: AppRouteHandler<typeof routes.createIntakeTemplateRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id } = c.req.valid('param');
  const body = c.req.valid('json');
  const template = await intakeTemplatesService.createTemplate({ organizationId: practice_id, data: body }, ctx);
  return c.json({ template }, 201);
};

export const getIntakeTemplateHandler: AppRouteHandler<typeof routes.getIntakeTemplateRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id, id } = c.req.valid('param');
  const template = await intakeTemplatesService.getTemplate({ organizationId: practice_id, id }, ctx);
  return c.json({ template });
};

export const updateIntakeTemplateHandler: AppRouteHandler<typeof routes.updateIntakeTemplateRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const template = await intakeTemplatesService.updateTemplate({ organizationId: practice_id, id, data: body }, ctx);
  return c.json({ template });
};

export const deleteIntakeTemplateHandler: AppRouteHandler<typeof routes.deleteIntakeTemplateRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id, id } = c.req.valid('param');
  await intakeTemplatesService.deleteTemplate({ organizationId: practice_id, id }, ctx);
  return c.body(null, 204);
};
