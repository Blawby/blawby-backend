import type {
  createDepositRoute,
  createWithdrawalRoute,
  getTrustTransactionsRoute,
  getTrustBalanceRoute,
  getTrustReportRoute,
} from '@/modules/trust/routes';
import { trustService } from '@/modules/trust/services/trust.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';

export const createDepositHandler: AppRouteHandler<typeof createDepositRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');
  const res = await trustService.manualDeposit({ data: body }, ctx);
  return sendResult(c, res, 201);
};

export const createWithdrawalHandler: AppRouteHandler<typeof createWithdrawalRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');
  const res = await trustService.manualWithdrawal({ data: body }, ctx);
  return sendResult(c, res, 201);
};

export const getTrustTransactionsHandler: AppRouteHandler<typeof getTrustTransactionsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const res = await trustService.getTransactions({
    organizationId: ctx.organizationId,
    clientId: query.client_id,
    matterId: query.matter_id,
    startDate: query.start_date ? new Date(query.start_date) : undefined,
    endDate: query.end_date ? new Date(query.end_date) : undefined,
  });

  return sendResult(c, res);
};

export const getTrustBalanceHandler: AppRouteHandler<typeof getTrustBalanceRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const res = await trustService.getBalance({
    organizationId: ctx.organizationId,
    clientId: query.client_id,
  });

  return sendResult(c, res);
};

export const getTrustReportHandler: AppRouteHandler<typeof getTrustReportRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const res = await trustService.getReport({
    organizationId: ctx.organizationId,
    startDate: query.start_date ? new Date(query.start_date) : undefined,
    endDate: query.end_date ? new Date(query.end_date) : undefined,
  });

  return sendResult(c, res);
};
