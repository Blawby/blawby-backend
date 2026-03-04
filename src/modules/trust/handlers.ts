import {
  getTrustTransactionsRoute,
  getTrustBalanceRoute,
  getTrustReportRoute,
} from '@/modules/trust/routes';
import { trustService } from '@/modules/trust/services/trust.service';
import { computeRoutingClaims } from '@/shared/auth/services/routing.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const getTrustTransactionsHandler: AppRouteHandler<typeof getTrustTransactionsRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id } = c.req.valid('param');
  const query = c.req.valid('query');

  const routing = await computeRoutingClaims({
    user: { id: user.id, isAnonymous: user.isAnonymous ?? false, banned: user.banned ?? null },
    session: { activeOrganizationId: practice_id },
  });
  if (!routing.workspace_access.practice) {
    return response.forbidden(c, 'Practice access required');
  }

  const res = await trustService.getTransactions({
    organizationId: practice_id,
    clientId: query.client_id,
    matterId: query.matter_id,
    startDate: query.start_date ? new Date(query.start_date) : undefined,
    endDate: query.end_date ? new Date(query.end_date) : undefined,
  });

  if (!res.success) return response.fromResult(c, res);
  return response.ok(c, { transactions: res.data });
};

export const getTrustBalanceHandler: AppRouteHandler<typeof getTrustBalanceRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id } = c.req.valid('param');
  const query = c.req.valid('query');

  const routing = await computeRoutingClaims({
    user: { id: user.id, isAnonymous: user.isAnonymous ?? false, banned: user.banned ?? null },
    session: { activeOrganizationId: practice_id },
  });
  if (!routing.workspace_access.practice) {
    return response.forbidden(c, 'Practice access required');
  }

  const res = await trustService.getBalance({
    organizationId: practice_id,
    clientId: query.client_id,
  });

  if (!res.success) return response.fromResult(c, res);
  return response.ok(c, res.data);
};

export const getTrustReportHandler: AppRouteHandler<typeof getTrustReportRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id } = c.req.valid('param');
  const query = c.req.valid('query');

  const routing = await computeRoutingClaims({
    user: { id: user.id, isAnonymous: user.isAnonymous ?? false, banned: user.banned ?? null },
    session: { activeOrganizationId: practice_id },
  });
  if (!routing.workspace_access.practice) {
    return response.forbidden(c, 'Practice access required');
  }

  const res = await trustService.getReport({
    organizationId: practice_id,
    startDate: query.start_date ? new Date(query.start_date) : undefined,
    endDate: query.end_date ? new Date(query.end_date) : undefined,
  });

  if (!res.success) return response.fromResult(c, res);
  return response.ok(c, { report: res.data });
};
