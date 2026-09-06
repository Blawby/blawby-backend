import type { createAccountSessionRoute, getConnectedAccountRoute } from '@/modules/stripe/routes/index';
import { accountSessionService } from '@/modules/stripe/services/account-session.service';
import { getConnectedAccount } from '@/modules/onboarding/operations/get-connected-account.operation';
import type { AppRouteHandler } from '@/shared/types/hono';
import { toLegalOperationContext } from '@/shared/types/legal-operation-context';
import { getServiceContext } from '@/shared/types/service-context';

const createAccountSessionHandler: AppRouteHandler<typeof createAccountSessionRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { components } = c.req.valid('json');

  const result = await accountSessionService.createAccountSession(ctx.organizationId, components, ctx);
  return c.json(result, 201);
};

const getConnectedAccountHandler: AppRouteHandler<typeof getConnectedAccountRoute> = async (c) => {
  const ctx = getServiceContext(c);

  const account = await getConnectedAccount({ organizationId: ctx.organizationId }, toLegalOperationContext(ctx));
  return c.json(account, 200);
};

export const handlers = {
  createAccountSessionHandler,
  getConnectedAccountHandler,
};
