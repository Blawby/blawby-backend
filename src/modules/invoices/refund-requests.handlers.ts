import {
  createRefundRequestRoute,
  listClientRefundRequestsRoute,
  cancelRefundRequestRoute,
  listPracticeRefundRequestsRoute,
  reviewRefundRequestRoute,
  executeRefundRoute,
} from '@/modules/invoices/refund-requests.routes';
import { refundRequestsService } from '@/modules/invoices/services/refund-requests.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { response } from '@/shared/utils/responseUtils';

export const createRefundRequestHandler: AppRouteHandler<typeof createRefundRequestRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const body = c.req.valid('json');
  const result = await refundRequestsService.createRequest({
    invoiceId: body.invoice_id,
    requestedAmount: body.requested_amount,
    reason: body.reason,
    notes: body.notes,
  }, ctx);
  if (!result.success) return response.fromResult(c, result);
  return response.created(c, { refundRequest: result.data });
};

export const listClientRefundRequestsHandler: AppRouteHandler<typeof listClientRefundRequestsRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const result = await refundRequestsService.listClientRequests(ctx);
  if (!result.success) return response.fromResult(c, result);
  return response.ok(c, { refundRequests: result.data });
};

export const cancelRefundRequestHandler: AppRouteHandler<typeof cancelRefundRequestRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const result = await refundRequestsService.cancelRequest({
    requestId: id,
  }, ctx);
  if (!result.success) return response.fromResult(c, result);
  return response.ok(c, { refundRequest: result.data });
};

export const listPracticeRefundRequestsHandler: AppRouteHandler<typeof listPracticeRefundRequestsRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');
  const result = await refundRequestsService.listPracticeRequests(ctx, {
    status: query.status,
    invoice_id: query.invoice_id,
    client_user_details_id: query.client_user_details_id,
  });
  if (!result.success) return response.fromResult(c, result);
  return response.ok(c, { refundRequests: result.data });
};

export const reviewRefundRequestHandler: AppRouteHandler<typeof reviewRefundRequestRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const body = c.req.valid('json');
  const result = await refundRequestsService.reviewRequest({
    requestId: id,
    action: body.action,
    reviewNotes: body.review_notes,
  }, ctx);
  if (!result.success) return response.fromResult(c, result);
  return response.ok(c, { refundRequest: result.data });
};

export const executeRefundHandler: AppRouteHandler<typeof executeRefundRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const result = await refundRequestsService.executeRefund({
    requestId: id,
  }, ctx);
  if (!result.success) return response.fromResult(c, result);
  return response.ok(c, { refundRequest: result.data });
};
