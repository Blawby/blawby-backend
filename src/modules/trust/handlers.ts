import { trustRoutes } from '@/modules/trust/routes';
import { trustService } from '@/modules/trust/services/trust.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const {
  getTrustTransactionsRoute,
  getTrustBalanceRoute,
  getTrustReportRoute,
  createDepositRoute,
  createWithdrawalRoute,
} = trustRoutes;

const createDepositHandler: AppRouteHandler<typeof createDepositRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');
  const transaction = await trustService.manualDeposit({ data: body }, ctx);
  return c.json(transaction, 201);
};

const createWithdrawalHandler: AppRouteHandler<typeof createWithdrawalRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');
  const transaction = await trustService.manualWithdrawal({ data: body }, ctx);
  return c.json(transaction, 201);
};

const getTrustTransactionsHandler: AppRouteHandler<typeof getTrustTransactionsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const transactions = await trustService.getTransactions(
    {
      organizationId: ctx.organizationId,
      clientId: query.client_id,
      matterId: query.matter_id,
      startDate: query.start_date ? new Date(query.start_date) : undefined,
      endDate: query.end_date ? new Date(query.end_date) : undefined,
    },
    ctx
  );

  return c.json(transactions, 200);
};

const getTrustBalanceHandler: AppRouteHandler<typeof getTrustBalanceRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const balance = await trustService.getBalance(
    {
      organizationId: ctx.organizationId,
      clientId: query.client_id,
    },
    ctx
  );

  return c.json(balance, 200);
};

const getTrustReportHandler: AppRouteHandler<typeof getTrustReportRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const report = await trustService.getReport(
    {
      organizationId: ctx.organizationId,
      startDate: query.start_date ? new Date(query.start_date) : undefined,
      endDate: query.end_date ? new Date(query.end_date) : undefined,
    },
    ctx
  );

  return c.json(report, 200);
};

export const handlers = {
  createDepositHandler,
  createWithdrawalHandler,
  getTrustTransactionsHandler,
  getTrustBalanceHandler,
  getTrustReportHandler,
};
