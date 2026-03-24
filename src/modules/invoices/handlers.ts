import type { routes } from '@/modules/invoices/routes';
import { invoiceCreationService } from '@/modules/invoices/services/invoice-creation.service';
import { invoiceLifecycleService } from '@/modules/invoices/services/invoice-lifecycle.service';
import { invoiceQueriesService } from '@/modules/invoices/services/invoice-queries.service';
import { invoiceStripeCoordinationService } from '@/modules/invoices/services/invoice-stripe-coordination.service';
export * from '@/modules/invoices/refund-requests.handlers';
import * as refundRequestHandlers from '@/modules/invoices/refund-requests.handlers';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';

const createInvoiceHandler: AppRouteHandler<typeof routes.createInvoiceRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const data = c.req.valid('json');

  const result = await invoiceCreationService.createInvoice({ data }, ctx);

  return sendResult(c, result, 201);
};

const listInvoicesHandler: AppRouteHandler<typeof routes.listInvoicesRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');

  const result = await invoiceQueriesService.listInvoices({ filters: query }, ctx);

  return sendResult(c, result);
};

const getInvoiceHandler: AppRouteHandler<typeof routes.getInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceQueriesService.getInvoiceById({ id }, ctx);

  return sendResult(c, result);
};

const updateInvoiceHandler: AppRouteHandler<typeof routes.updateInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const data = c.req.valid('json');

  const result = await invoiceLifecycleService.updateInvoice({ id, data }, ctx);

  return sendResult(c, result);
};

const deleteInvoiceHandler: AppRouteHandler<typeof routes.deleteInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceLifecycleService.deleteInvoice({ id }, ctx);

  return sendResult(c, result);
};

const sendInvoiceHandler: AppRouteHandler<typeof routes.sendInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceStripeCoordinationService.sendInvoice({ id }, ctx);

  return sendResult(c, result);
};

const syncInvoiceHandler: AppRouteHandler<typeof routes.syncInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceStripeCoordinationService.syncInvoice({ id }, ctx);

  return sendResult(c, result);
};

const voidInvoiceHandler: AppRouteHandler<typeof routes.voidInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceStripeCoordinationService.voidInvoice({ id }, ctx);

  return sendResult(c, result);
};

const getClientInvoicesHandler: AppRouteHandler<typeof routes.getClientInvoicesRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');

  const result = await invoiceQueriesService.listClientInvoices({ filters: query }, ctx);

  return sendResult(c, result);
};

const getClientInvoiceDetailHandler: AppRouteHandler<typeof routes.getClientInvoiceDetailRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceQueriesService.getClientInvoiceDetail({ invoiceId: id }, ctx);

  return sendResult(c, result);
};

export const handlers = {
  ...refundRequestHandlers,
  createInvoiceHandler,
  listInvoicesHandler,
  getInvoiceHandler,
  updateInvoiceHandler,
  deleteInvoiceHandler,
  sendInvoiceHandler,
  syncInvoiceHandler,
  voidInvoiceHandler,
  getClientInvoicesHandler,
  getClientInvoiceDetailHandler,
};
