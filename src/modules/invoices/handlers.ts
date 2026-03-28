import type { routes } from '@/modules/invoices/routes';
import { invoiceCreationService } from '@/modules/invoices/services/invoice-creation.service';
import { invoiceLifecycleService } from '@/modules/invoices/services/invoice-lifecycle.service';
import { invoiceQueriesService } from '@/modules/invoices/services/invoice-queries.service';
import { invoiceStripeCoordinationService } from '@/modules/invoices/services/invoice-stripe-coordination.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';
import { result } from '@/shared/utils/result';

const createInvoiceHandler: AppRouteHandler<typeof routes.createInvoiceRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const data = c.req.valid('json');

  const createdInvoice = await invoiceCreationService.createInvoice({ data }, ctx);

  return sendResult(c, result.ok(createdInvoice), 201);
};

const listInvoicesHandler: AppRouteHandler<typeof routes.listInvoicesRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');

  const invoices = await invoiceQueriesService.listInvoices({ filters: query }, ctx);

  return sendResult(c, result.ok(invoices));
};

const getInvoiceHandler: AppRouteHandler<typeof routes.getInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const invoice = await invoiceQueriesService.getInvoiceById({ id }, ctx);

  return sendResult(c, result.ok(invoice));
};

const updateInvoiceHandler: AppRouteHandler<typeof routes.updateInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const data = c.req.valid('json');

  const updatedInvoice = await invoiceLifecycleService.updateInvoice({ id, data }, ctx);

  return sendResult(c, result.ok(updatedInvoice));
};

const deleteInvoiceHandler: AppRouteHandler<typeof routes.deleteInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const deleted = await invoiceLifecycleService.deleteInvoice({ id }, ctx);

  return sendResult(c, result.ok(deleted));
};

const sendInvoiceHandler: AppRouteHandler<typeof routes.sendInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const sentInvoice = await invoiceStripeCoordinationService.sendInvoice({ id }, ctx);

  return sendResult(c, result.ok(sentInvoice));
};

const syncInvoiceHandler: AppRouteHandler<typeof routes.syncInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const syncedInvoice = await invoiceStripeCoordinationService.syncInvoice({ id }, ctx);

  return sendResult(c, result.ok(syncedInvoice));
};

const voidInvoiceHandler: AppRouteHandler<typeof routes.voidInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const voidedInvoice = await invoiceStripeCoordinationService.voidInvoice({ id }, ctx);

  return sendResult(c, result.ok(voidedInvoice));
};

const getClientInvoicesHandler: AppRouteHandler<typeof routes.getClientInvoicesRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');

  const clientInvoices = await invoiceQueriesService.listClientInvoices({ filters: query }, ctx);

  return sendResult(c, result.ok(clientInvoices));
};

const getClientInvoiceDetailHandler: AppRouteHandler<typeof routes.getClientInvoiceDetailRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const invoiceDetail = await invoiceQueriesService.getClientInvoiceDetail({ invoiceId: id }, ctx);

  return sendResult(c, result.ok(invoiceDetail));
};

export const handlers = {
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
