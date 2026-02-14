import {
  createInvoiceRoute,
  getInvoicesRoute,
  updateInvoiceRoute,
  deleteInvoiceRoute,
  sendInvoiceRoute,
  syncInvoiceRoute,
  voidInvoiceRoute,
} from '@/modules/invoices/routes';
import { invoicesService } from '@/modules/invoices/services/invoices.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const createInvoiceHandler: AppRouteHandler<typeof createInvoiceRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id } = c.req.valid('param');
  const data = c.req.valid('json');
  const requestHeaders = Object.fromEntries(c.req.raw.headers);

  const result = await invoicesService.createInvoice(
    practice_id,
    data,
    user,
    requestHeaders,
  );

  return response.fromResult(c, result, 201);
};

export const getInvoicesHandler: AppRouteHandler<typeof getInvoicesRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id } = c.req.valid('param');
  const query = c.req.valid('query');
  const requestHeaders = Object.fromEntries(c.req.raw.headers);

  const result = await invoicesService.listInvoices(
    practice_id,
    query,
    user,
    requestHeaders,
  );

  return response.fromResult(c, result);
};


export const updateInvoiceHandler: AppRouteHandler<typeof updateInvoiceRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id, id } = c.req.valid('param');
  const data = c.req.valid('json');
  const requestHeaders = Object.fromEntries(c.req.raw.headers);

  const result = await invoicesService.updateInvoice(
    practice_id,
    id,
    data,
    user,
    requestHeaders,
  );

  return response.fromResult(c, result);
};

export const deleteInvoiceHandler: AppRouteHandler<typeof deleteInvoiceRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id, id } = c.req.valid('param');
  const requestHeaders = Object.fromEntries(c.req.raw.headers);

  const result = await invoicesService.deleteInvoice(
    practice_id,
    id,
    user,
    requestHeaders,
  );

  return response.fromResult(c, result, 204);
};

export const sendInvoiceHandler: AppRouteHandler<typeof sendInvoiceRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id, id } = c.req.valid('param');
  const requestHeaders = Object.fromEntries(c.req.raw.headers);

  const result = await invoicesService.sendInvoice(
    practice_id,
    id,
    user,
    requestHeaders,
  );

  return response.fromResult(c, result);
};

export const syncInvoiceHandler: AppRouteHandler<typeof syncInvoiceRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id, id } = c.req.valid('param');
  const requestHeaders = Object.fromEntries(c.req.raw.headers);

  const result = await invoicesService.syncInvoice(
    practice_id,
    id,
    user,
    requestHeaders,
  );

  return response.fromResult(c, result);
};

export const voidInvoiceHandler: AppRouteHandler<typeof voidInvoiceRoute> = async (c) => {
  const user = c.get('user');
  if (!user) return response.unauthorized(c);
  const { practice_id, id } = c.req.valid('param');
  const requestHeaders = Object.fromEntries(c.req.raw.headers);

  const result = await invoicesService.voidInvoice(
    practice_id,
    id,
    user,
    requestHeaders,
  );

  return response.fromResult(c, result);
};
