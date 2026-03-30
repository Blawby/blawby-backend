import type { createAccountSessionRoute, getConnectedAccountRoute } from '@/modules/stripe/routes/index';
import { accountSessionService } from '@/modules/stripe/services/account-session.service';
import { connectedAccountsService } from '@/modules/onboarding/services/connected-accounts.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';

const createAccountSessionHandler: AppRouteHandler<typeof createAccountSessionRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { components } = c.req.valid('json');

  const result = await accountSessionService.createAccountSession(ctx.organizationId, components);
  return c.json(result, 201);
};

const getConnectedAccountHandler: AppRouteHandler<typeof getConnectedAccountRoute> = async (c) => {
  const ctx = getServiceContext(c);

  const result = await connectedAccountsService.getAccount(ctx.organizationId);
  if (!result.success) {
    throw new HTTPException(result.error.status, { message: result.error.message });
  }

  if (result.data === null) {
    throw new HTTPException(404, { message: 'No connected Stripe account found for this practice' });
  }

  return c.json(result.data);
};

export const handlers = {
  createAccountSessionHandler,
  getConnectedAccountHandler,
};
