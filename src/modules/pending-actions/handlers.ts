import { executePendingAction } from '@/modules/mcp/pending-action-executor';
import { pendingActionsService } from '@/modules/pending-actions/services/pending-actions.service';
import type { routes } from '@/modules/pending-actions/routes';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const listPendingActionsHandler: AppRouteHandler<typeof routes.listPendingActionsRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');
  const pendingActions = await pendingActionsService.listByOrganization(ctx, { status: query.status });
  return c.json({ pendingActions }, 200);
};

const getPendingActionHandler: AppRouteHandler<typeof routes.getPendingActionRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const pendingAction = await pendingActionsService.getById(id, ctx);
  return c.json({ pendingAction }, 200);
};

const approvePendingActionHandler: AppRouteHandler<typeof routes.approvePendingActionRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const pendingAction = await pendingActionsService.approve(id, ctx, executePendingAction);
  return c.json({ pendingAction }, 200);
};

const rejectPendingActionHandler: AppRouteHandler<typeof routes.rejectPendingActionRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const body = c.req.valid('json');
  const pendingAction = await pendingActionsService.reject(id, ctx, body.review_notes);
  return c.json({ pendingAction }, 200);
};

export const handlers = {
  listPendingActionsHandler,
  getPendingActionHandler,
  approvePendingActionHandler,
  rejectPendingActionHandler,
};
