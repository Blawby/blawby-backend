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

  const account = await connectedAccountsService.getAccount(ctx.organizationId);
  if (account === null) {
    throw new HTTPException(404, { message: 'No connected Stripe account found for this practice' });
  }

  return c.json(account);
};

export const handlers = {
  createAccountSessionHandler,
  getConnectedAccountHandler,
};
