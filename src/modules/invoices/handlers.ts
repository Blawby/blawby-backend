import { routes } from '@/modules/invoices/routes';
import { invoiceCreationService } from '@/modules/invoices/services/invoice-creation.service';
import { invoiceLifecycleService } from '@/modules/invoices/services/invoice-lifecycle.service';
import { invoiceQueriesService } from '@/modules/invoices/services/invoice-queries.service';
import { invoiceStripeCoordinationService } from '@/modules/invoices/services/invoice-stripe-coordination.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { response } from '@/shared/utils/responseUtils';

export const createInvoiceHandler: AppRouteHandler<typeof routes.createInvoiceRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const data = c.req.valid('json');

  const result = await invoiceCreationService.createInvoice({ data }, ctx);

  return response.fromResult(c, result, 201);
};

export const getInvoicesHandler: AppRouteHandler<typeof routes.getInvoicesRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');

  const result = await invoiceQueriesService.listInvoices({ filters: query }, ctx);

  return response.fromResult(c, result);
};

export const updateInvoiceHandler: AppRouteHandler<typeof routes.updateInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const data = c.req.valid('json');

  const result = await invoiceLifecycleService.updateInvoice({ id, data }, ctx);

  return response.fromResult(c, result);
};

export const deleteInvoiceHandler: AppRouteHandler<typeof routes.deleteInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceLifecycleService.deleteInvoice({ id }, ctx);

  return response.fromResult(c, result);
};

export const sendInvoiceHandler: AppRouteHandler<typeof routes.sendInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceStripeCoordinationService.sendInvoice({ id }, ctx);

  return response.fromResult(c, result);
};

export const syncInvoiceHandler: AppRouteHandler<typeof routes.syncInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceStripeCoordinationService.syncInvoice({ id }, ctx);

  return response.fromResult(c, result);
};

export const voidInvoiceHandler: AppRouteHandler<typeof routes.voidInvoiceRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceStripeCoordinationService.voidInvoice({ id }, ctx);

  return response.fromResult(c, result);
};

export const getClientInvoicesHandler: AppRouteHandler<typeof routes.getClientInvoicesRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');

  const result = await invoiceQueriesService.listClientInvoices({ filters: query }, ctx);

  return response.fromResult(c, result);
};

export const getClientInvoiceDetailHandler: AppRouteHandler<typeof routes.getClientInvoiceDetailRoute> = async (c) => {
  const { id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceQueriesService.getClientInvoiceDetail({ invoiceId: id }, ctx);

  return response.fromResult(c, result);
};
