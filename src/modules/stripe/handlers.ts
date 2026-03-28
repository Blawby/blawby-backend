import type { createAccountSessionRoute, getConnectedAccountRoute } from '@/modules/stripe/routes/index';
import { accountSessionService } from '@/modules/stripe/services/account-session.service';
import { connectedAccountsService } from '@/modules/onboarding/services/connected-accounts.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

import { notFound } from '@/shared/utils/result';
import { sendResult } from '@/shared/utils/responseUtils';

const createAccountSessionHandler: AppRouteHandler<typeof createAccountSessionRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { components } = c.req.valid('json');

  const result = await accountSessionService.createAccountSession(ctx.organizationId, components);
  return sendResult(c, result, 201);
};

const getConnectedAccountHandler: AppRouteHandler<typeof getConnectedAccountRoute> = async (c) => {
  const ctx = getServiceContext(c);

  const result = await connectedAccountsService.getAccount(ctx.organizationId);
  if (!result.success) {
    return sendResult(c, result);
  }

  if (result.data === null) {
    return sendResult(c, notFound('No connected Stripe account found for this practice'));
  }

  return sendResult(c, result);
};

export const handlers = {
  createAccountSessionHandler,
  getConnectedAccountHandler,
};
