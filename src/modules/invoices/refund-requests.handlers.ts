import {
  createRefundRequestRoute,
  listClientRefundRequestsRoute,
  cancelRefundRequestRoute,
  listPracticeRefundRequestsRoute,
  reviewRefundRequestRoute,
  executeRefundRoute,
} from '@/modules/invoices/refund-requests.routes';
import { refundRequestsService } from '@/modules/invoices/services/refund-requests.service';
import { getServiceContext } from '@/shared/types/service-context';
import { response } from '@/shared/utils/responseUtils';

export const createRefundRequestHandler = async (c: any) => {
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

export const listClientRefundRequestsHandler = async (c: any) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const result = await refundRequestsService.listClientRequests(ctx);
  if (!result.success) return response.fromResult(c, result);
  return response.ok(c, { refundRequests: result.data });
};

export const cancelRefundRequestHandler = async (c: any) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const result = await refundRequestsService.cancelRequest({
    requestId: id,
  }, ctx);
  if (!result.success) return response.fromResult(c, result);
  return response.ok(c, { refundRequest: result.data });
};

export const listPracticeRefundRequestsHandler = async (c: any) => {
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

export const reviewRefundRequestHandler = async (c: any) => {
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

export const executeRefundHandler = async (c: any) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const result = await refundRequestsService.executeRefund({
    requestId: id,
  }, ctx);
  if (!result.success) return response.fromResult(c, result);
  return response.ok(c, { refundRequest: result.data });
};
