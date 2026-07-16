import { trustRoutes } from '@/modules/trust/routes';
import { trustService } from '@/modules/trust/services/trust.service';
import { trustReadinessService } from '@/modules/trust/services/trust-readiness.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const {
  getTrustTransactionsRoute,
  getTrustBalanceRoute,
  getTrustReportRoute,
  createDepositRoute,
  createWithdrawalRoute,
  getTrustClientBalancesRoute,
  createTrustReconciliationRoute,
  listTrustReconciliationsRoute,
  getTrustReadinessRoute,
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

const getTrustClientBalancesHandler: AppRouteHandler<typeof getTrustClientBalancesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const balances = await trustService.getClientBalances({}, ctx);
  return c.json(balances, 200);
};

const createTrustReconciliationHandler: AppRouteHandler<typeof createTrustReconciliationRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const data = c.req.valid('json');
  const reconciliation = await trustReadinessService.reconcile({ data }, ctx);
  return c.json(reconciliation, 201);
};

const listTrustReconciliationsHandler: AppRouteHandler<typeof listTrustReconciliationsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { limit } = c.req.valid('query');
  const reconciliations = await trustReadinessService.listReconciliations({ limit }, ctx);
  return c.json(reconciliations, 200);
};

const getTrustReadinessHandler: AppRouteHandler<typeof getTrustReadinessRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const readiness = await trustReadinessService.getReadiness({}, ctx);
  return c.json(readiness, 200);
};

export const handlers = {
  createDepositHandler,
  createWithdrawalHandler,
  getTrustTransactionsHandler,
  getTrustBalanceHandler,
  getTrustReportHandler,
  getTrustClientBalancesHandler,
  createTrustReconciliationHandler,
  listTrustReconciliationsHandler,
  getTrustReadinessHandler,
};
