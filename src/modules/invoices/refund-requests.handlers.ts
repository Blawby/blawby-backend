import {
  createRefundRequestRoute,
  listClientRefundRequestsRoute,
  cancelRefundRequestRoute,
  listPracticeRefundRequestsRoute,
  reviewRefundRequestRoute,
  executeRefundRoute,
} from '@/modules/invoices/refund-requests.routes';
import { refundRequestsService } from '@/modules/invoices/services/refund-requests.service';
import { computeRoutingClaims } from '@/shared/auth/services/routing.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const createRefundRequestHandler: AppRouteHandler<typeof createRefundRequestRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id, invoice_id } = c.req.valid('param');

  const routing = await computeRoutingClaims({
    user: { id: user.id, isAnonymous: user.isAnonymous ?? false, banned: user.banned ?? null },
    session: { activeOrganizationId: practice_id },
  });
  if (!routing.workspace_access.client) return response.forbidden(c, 'Client access required');

  const body = c.req.valid('json');
  const res = await refundRequestsService.createRequest({
    organizationId: practice_id,
    invoiceId: invoice_id,
    userId: user.id,
    requestedAmount: body.requested_amount,
    reason: body.reason,
    notes: body.notes,
  });

  if (!res.success) return response.fromResult(c, res);
  return response.created(c, { refundRequest: res.data });
};

export const listClientRefundRequestsHandler: AppRouteHandler<typeof listClientRefundRequestsRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id } = c.req.valid('param');

  const routing = await computeRoutingClaims({
    user: { id: user.id, isAnonymous: user.isAnonymous ?? false, banned: user.banned ?? null },
    session: { activeOrganizationId: practice_id },
  });
  if (!routing.workspace_access.client) return response.forbidden(c, 'Client access required');

  const res = await refundRequestsService.listClientRequests(practice_id, user.id);
  if (!res.success) return response.fromResult(c, res);
  return response.ok(c, { refundRequests: res.data });
};

export const cancelRefundRequestHandler: AppRouteHandler<typeof cancelRefundRequestRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id, id } = c.req.valid('param');

  const routing = await computeRoutingClaims({
    user: { id: user.id, isAnonymous: user.isAnonymous ?? false, banned: user.banned ?? null },
    session: { activeOrganizationId: practice_id },
  });
  if (!routing.workspace_access.client) return response.forbidden(c, 'Client access required');

  const res = await refundRequestsService.cancelRequest({
    organizationId: practice_id,
    requestId: id,
    userId: user.id,
  });
  if (!res.success) return response.fromResult(c, res);
  return response.ok(c, { refundRequest: res.data });
};

export const listPracticeRefundRequestsHandler: AppRouteHandler<typeof listPracticeRefundRequestsRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id } = c.req.valid('param');

  const routing = await computeRoutingClaims({
    user: { id: user.id, isAnonymous: user.isAnonymous ?? false, banned: user.banned ?? null },
    session: { activeOrganizationId: practice_id },
  });
  if (!routing.workspace_access.practice) return response.forbidden(c, 'Practice access required');

  const query = c.req.valid('query');
  const res = await refundRequestsService.listPracticeRequests(practice_id, {
    status: query.status,
    invoice_id: query.invoice_id,
    client_user_details_id: query.client_user_details_id,
  });
  if (!res.success) return response.fromResult(c, res);
  return response.ok(c, { refundRequests: res.data });
};

export const reviewRefundRequestHandler: AppRouteHandler<typeof reviewRefundRequestRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id, id } = c.req.valid('param');

  const routing = await computeRoutingClaims({
    user: { id: user.id, isAnonymous: user.isAnonymous ?? false, banned: user.banned ?? null },
    session: { activeOrganizationId: practice_id },
  });
  if (!routing.workspace_access.practice) return response.forbidden(c, 'Practice access required');

  const body = c.req.valid('json');
  const res = await refundRequestsService.reviewRequest({
    organizationId: practice_id,
    requestId: id,
    reviewerUserId: user.id,
    action: body.action,
    reviewNotes: body.review_notes,
  });
  if (!res.success) return response.fromResult(c, res);
  return response.ok(c, { refundRequest: res.data });
};

export const executeRefundHandler: AppRouteHandler<typeof executeRefundRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id, id } = c.req.valid('param');

  const routing = await computeRoutingClaims({
    user: { id: user.id, isAnonymous: user.isAnonymous ?? false, banned: user.banned ?? null },
    session: { activeOrganizationId: practice_id },
  });
  if (!routing.workspace_access.practice) return response.forbidden(c, 'Practice access required');

  const res = await refundRequestsService.executeRefund({
    organizationId: practice_id,
    requestId: id,
    executorUserId: user.id,
  });
  if (!res.success) return response.fromResult(c, res);
  return response.ok(c, { refundRequest: res.data });
};
