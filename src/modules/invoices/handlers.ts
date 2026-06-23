import type { routes } from '@/modules/invoices/routes';
import { serializeInvoice, serializePaginatedInvoices } from '@/modules/invoices/serializers/invoice.serializer';
import { invoiceService } from '@/modules/invoices/services/invoice.service';
import { invoiceDeliveryService } from '@/modules/invoices/services/invoice.delivery.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const createInvoiceHandler: AppRouteHandler<typeof routes.createInvoiceRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const data = c.req.valid('json');

  const result = await invoiceService.createInvoice({ data }, ctx);

  return c.json(serializeInvoice(result), 201);
};

const listInvoicesHandler: AppRouteHandler<typeof routes.listInvoicesRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');

  const result = await invoiceService.listInvoices({ filters: query }, ctx);

  return c.json(serializePaginatedInvoices(result), 200);
};

const getInvoiceHandler: AppRouteHandler<typeof routes.getInvoiceRoute> = async (c) => {
  const { invoice_id: id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceService.getInvoiceById({ id }, ctx);

  return c.json(serializeInvoice(result), 200);
};

const updateInvoiceHandler: AppRouteHandler<typeof routes.updateInvoiceRoute> = async (c) => {
  const { invoice_id: id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const data = c.req.valid('json');

  const result = await invoiceService.updateInvoice({ id, data }, ctx);

  return c.json(serializeInvoice(result), 200);
};

const deleteInvoiceHandler: AppRouteHandler<typeof routes.deleteInvoiceRoute> = async (c) => {
  const { invoice_id: id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  await invoiceService.deleteInvoice({ id }, ctx);

  return c.body(null, 204);
};

const sendInvoiceHandler: AppRouteHandler<typeof routes.sendInvoiceRoute> = async (c) => {
  const { invoice_id: id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const result = await invoiceDeliveryService.sendInvoice({ id }, ctx);

  return c.json(serializeInvoice(result), 200);
};

const syncInvoiceHandler: AppRouteHandler<typeof routes.syncInvoiceRoute> = async (c) => {
  const { invoice_id: id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceDeliveryService.syncInvoice({ id }, ctx);

  return c.json(serializeInvoice(result), 200);
};

const voidInvoiceHandler: AppRouteHandler<typeof routes.voidInvoiceRoute> = async (c) => {
  const { invoice_id: id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const result = await invoiceDeliveryService.voidInvoice({ id }, ctx);

  return c.json(serializeInvoice(result), 200);
};

const getClientInvoicesHandler: AppRouteHandler<typeof routes.getClientInvoicesRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');

  const result = await invoiceService.listClientInvoices({ filters: query }, ctx);

  return c.json(serializePaginatedInvoices(result), 200);
};

const getClientInvoiceDetailHandler: AppRouteHandler<typeof routes.getClientInvoiceDetailRoute> = async (c) => {
  const { invoice_id: id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await invoiceService.getClientInvoiceDetail({ invoiceId: id }, ctx);

  return c.json(serializeInvoice(result), 200);
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
} as const;
