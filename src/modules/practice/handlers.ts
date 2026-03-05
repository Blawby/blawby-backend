import { routes } from '@/modules/practice/routes';
import { practiceManagementService } from '@/modules/practice/services/practice-management.service';
import { practiceQueriesService } from '@/modules/practice/services/practice-queries.service';
import { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { response } from '@/shared/utils/responseUtils';

export const listPracticesHandler: AppRouteHandler<typeof routes.listPracticesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const result = await practiceQueriesService.listPractices({ requestHeaders: c.req.header() }, ctx);
  return response.fromResult(c, result);
};

export const createPracticeHandler: AppRouteHandler<typeof routes.createPracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const validatedBody = c.req.valid('json');
  const result = await practiceManagementService.createPractice({
    data: validatedBody,
    requestHeaders: c.req.header(),
  }, ctx);
  return response.fromResult(c, result, 201);
};

export const getPracticeHandler: AppRouteHandler<typeof routes.getPracticeByIdRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const result = await practiceQueriesService.getPracticeById(
    { organizationId: uuid, requestHeaders: c.req.header() },
    ctx,
  );
  return response.fromResult(c, result);
};

export const updatePracticeHandler: AppRouteHandler<typeof routes.updatePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceManagementService.updatePractice({
    organizationId: uuid,
    data: validatedBody,
    requestHeaders: c.req.header(),
  }, ctx);
  return response.fromResult(c, result);
};

export const deletePracticeHandler: AppRouteHandler<typeof routes.deletePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const result = await practiceManagementService.deletePractice(
    { organizationId: uuid, requestHeaders: c.req.header() },
    ctx,
  );
  return response.fromResult(c, result, 204);
};

export const setActivePracticeHandler: AppRouteHandler<typeof routes.setActivePracticeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const result = await practiceManagementService.setActivePractice(
    { organizationId: uuid, requestHeaders: c.req.header() },
    ctx,
  );
  return response.fromResult(c, result);
};

export const getPracticeDetailsHandler: AppRouteHandler<typeof routes.getPracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const result = await practiceQueriesService.getPracticeDetails(
    { organizationId: uuid, requestHeaders: c.req.header() },
    ctx,
  );
  return response.fromResult(c, result);
};

export const createPracticeDetailsHandler: AppRouteHandler<typeof routes.createPracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceManagementService.upsertPracticeDetails({
    organizationId: uuid,
    data: validatedBody,
    requestHeaders: c.req.header(),
  }, ctx);
  return response.fromResult(c, result, 201);
};

export const updatePracticeDetailsHandler: AppRouteHandler<typeof routes.updatePracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceManagementService.upsertPracticeDetails({
    organizationId: uuid,
    data: validatedBody,
    requestHeaders: c.req.header(),
  }, ctx);
  return response.fromResult(c, result);
};

export const deletePracticeDetailsHandler: AppRouteHandler<typeof routes.deletePracticeDetailsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const result = await practiceManagementService.deletePracticeDetails(
    { organizationId: uuid, requestHeaders: c.req.header() },
    ctx,
  );
  return response.fromResult(c, result, 204);
};

export const getPracticeDetailsBySlugHandler: AppRouteHandler<typeof
  routes.getPracticeDetailsBySlugRoute> = async (c) => {
    const ctx = getServiceContext(c);
    const { slug } = c.req.valid('param');
    const result = await practiceQueriesService.getPracticeBySlug({ slug }, ctx);
    return response.fromResult(c, result);
  };

