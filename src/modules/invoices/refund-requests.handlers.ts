import { getServiceContext } from '@/shared/types/service-context';
import { refundRequestsService } from '@/modules/invoices/services/refund-requests.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import type { refundRequestRoutes as routes } from '@/modules/invoices/refund-requests.routes';

const createRefundRequestHandler: AppRouteHandler<typeof routes.createRefundRequestRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const body = c.req.valid('json');
  const refundRequest = await refundRequestsService.createRequest(
    {
      invoiceId: body.invoice_id,
      requestedAmount: body.requested_amount,
      reason: body.reason,
      notes: body.notes,
    },
    ctx
  );
  return c.json(refundRequest, 201);
};

const listClientRefundRequestsHandler: AppRouteHandler<typeof routes.listClientRefundRequestsRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const refundRequests = await refundRequestsService.listClientRequests(ctx);
  return c.json(refundRequests, 200);
};

const cancelRefundRequestHandler: AppRouteHandler<typeof routes.cancelRefundRequestRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const refundRequest = await refundRequestsService.cancelRequest(
    {
      requestId: id,
    },
    ctx
  );
  return c.json(refundRequest, 200);
};

const listPracticeRefundRequestsHandler: AppRouteHandler<typeof routes.listPracticeRefundRequestsRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');
  const refundRequests = await refundRequestsService.listPracticeRequests(ctx, {
    status: query.status,
    invoice_id: query.invoice_id,
    client_user_details_id: query.client_user_details_id,
  });
  return c.json(refundRequests, 200);
};

const reviewRefundRequestHandler: AppRouteHandler<typeof routes.reviewRefundRequestRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const body = c.req.valid('json');
  const refundRequest = await refundRequestsService.reviewRequest(
    {
      requestId: id,
      action: body.action,
      reviewNotes: body.review_notes,
    },
    ctx
  );
  return c.json(refundRequest, 200);
};

const executeRefundHandler: AppRouteHandler<typeof routes.executeRefundRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const refundRequest = await refundRequestsService.executeRefund(
    {
      requestId: id,
    },
    ctx
  );
  return c.json(refundRequest, 200);
};

export const refundRequestHandlers = {
  createRefundRequestHandler,
  listClientRefundRequestsHandler,
  cancelRefundRequestHandler,
  listPracticeRefundRequestsHandler,
  reviewRefundRequestHandler,
  executeRefundHandler,
};
