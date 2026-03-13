import type { createAccountSessionRoute, getConnectedAccountRoute } from '@/modules/stripe/routes/index';
import { accountSessionService } from '@/modules/stripe/services/account-session.service';
import { connectedAccountsService } from '@/modules/onboarding/services/connected-accounts.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { notFound } from '@/shared/utils/result';
import { response } from '@/shared/utils/responseUtils';

const createAccountSessionHandler: AppRouteHandler<typeof createAccountSessionRoute> = async (c) => {
  const { practice_id: organizationId, components } = c.req.valid('json');
  getServiceContext(c);

  const result = await accountSessionService.createAccountSession(organizationId, components);
  return response.fromResult(c, result, 201);
};

const getConnectedAccountHandler: AppRouteHandler<typeof getConnectedAccountRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  getServiceContext(c);

  const result = await connectedAccountsService.getAccount(organizationId);
  if (!result.success) {
    return response.fromResult(c, result);
  }

  if (result.data === null) {
    return response.fromResult(c, notFound('No connected Stripe account found for this practice'));
  }

  return response.fromResult(c, result);
};

export const handlers = {
  createAccountSessionHandler,
  getConnectedAccountHandler,
};
