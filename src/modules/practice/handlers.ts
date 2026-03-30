import type { routes } from '@/modules/practice/routes';
import { practiceDetailsManagementService } from '@/modules/practice/services/practice-details-management.service';
import { practiceManagementService } from '@/modules/practice/services/practice-management.service';
import { practiceQueriesService } from '@/modules/practice/services/practice-queries.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

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
  const { uuid } = c.req.valid('param');
  const result = await practiceQueriesService.getPracticeById({ organizationId: uuid }, ctx);
  return c.json(result);
};

export const updatePracticeHandler: AppRouteHandler<typeof routes.updatePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceManagementService.updatePractice(
    {
      organizationId: uuid,
      data: validatedBody,
    },
    ctx
  );
  return c.json(result);
};

export const deletePracticeHandler: AppRouteHandler<typeof routes.deletePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  await practiceDetailsManagementService.deletePractice({ organizationId: uuid }, ctx);
  return c.body(null, 204);
};

export const setActivePracticeHandler: AppRouteHandler<typeof routes.setActivePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  await practiceDetailsManagementService.setActivePractice({ organizationId: uuid }, ctx);
  return c.json({ success: true });
};

export const getPracticeDetailsHandler: AppRouteHandler<typeof routes.getPracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const result = await practiceQueriesService.getPracticeDetails({ organizationId: uuid }, ctx);
  return c.json(result);
};

export const createPracticeDetailsHandler: AppRouteHandler<typeof routes.createPracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceDetailsManagementService.upsertPracticeDetails(
    {
      organizationId: uuid,
      data: validatedBody,
    },
    ctx
  );
  return c.json(result, 201);
};

export const updatePracticeDetailsHandler: AppRouteHandler<typeof routes.updatePracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceDetailsManagementService.upsertPracticeDetails(
    {
      organizationId: uuid,
      data: validatedBody,
    },
    ctx
  );
  return c.json(result);
};

export const deletePracticeDetailsHandler: AppRouteHandler<typeof routes.deletePracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  await practiceDetailsManagementService.deletePracticeDetails({ organizationId: uuid }, ctx);
  return c.body(null, 204);
};

export const getPracticeDetailsBySlugHandler: AppRouteHandler<typeof routes.getPracticeDetailsBySlugRoute> = async (
  c
) => {
  const ctx = getServiceContext(c);
  const { slug } = c.req.valid('param');
  const result = await practiceQueriesService.getPracticeBySlug({ slug }, ctx);
  return c.json(result);
};
