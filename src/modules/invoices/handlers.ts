import {
  createInvoiceRoute,
  getInvoicesRoute,
  getInvoiceRoute,
  updateInvoiceRoute,
  deleteInvoiceRoute,
  sendInvoiceRoute,
  syncInvoiceRoute,
  getPublicInvoiceRoute,
} from '@/modules/invoices/routes';
import { invoicesService } from '@/modules/invoices/services/invoices.service';
import { paymentLinksService } from '@/modules/invoices/services/payment-links.service';
import type { User } from '@/shared/types/BetterAuth';
import type { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const createInvoiceHandler: AppRouteHandler<typeof createInvoiceRoute> = async (c) => {
  const user = c.get('user') as User;
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
  const user = c.get('user') as User;
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

export const getInvoiceHandler: AppRouteHandler<typeof getInvoiceRoute> = async (c) => {
  const user = c.get('user') as User;
  const { practice_id, id } = c.req.valid('param');
  const requestHeaders = Object.fromEntries(c.req.raw.headers);

  const result = await invoicesService.getInvoiceById(
    practice_id,
    id,
    user,
    requestHeaders,
  );

  return response.fromResult(c, result);
};

export const updateInvoiceHandler: AppRouteHandler<typeof updateInvoiceRoute> = async (c) => {
  const user = c.get('user') as User;
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
  const user = c.get('user') as User;
  const { practice_id, id } = c.req.valid('param');
  const requestHeaders = Object.fromEntries(c.req.raw.headers);

  const result = await invoicesService.deleteInvoice(
    practice_id,
    id,
    user,
    requestHeaders,
  );

  return response.fromResult(c, result);
};

export const sendInvoiceHandler: AppRouteHandler<typeof sendInvoiceRoute> = async (c) => {
  const user = c.get('user') as User;
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
  const user = c.get('user') as User;
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

export const getPublicInvoiceHandler: AppRouteHandler<typeof getPublicInvoiceRoute> = async (c) => {
  const { token } = c.req.valid('param');

  const result = await paymentLinksService.getInvoiceByToken(token);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { invoice: result.data });
};
