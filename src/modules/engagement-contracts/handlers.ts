import { routes } from '@/modules/engagement-contracts/routes';
import { engagementContractService } from '@/modules/engagement-contracts/services/engagement-contract.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const createEngagementContractHandler: AppRouteHandler<typeof routes.createEngagementContractRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');

  const contract = await engagementContractService.createEngagementContract({ data: body }, ctx);
  return c.json(contract, 201);
};

const listEngagementContractsHandler: AppRouteHandler<typeof routes.listEngagementContractsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const response = await engagementContractService.listEngagementContracts(query, ctx);
  return c.json(response);
};

const getEngagementContractHandler: AppRouteHandler<typeof routes.getEngagementContractRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');

  const contract = await engagementContractService.getEngagementContract({ id }, ctx);
  return c.json(contract);
};

const updateEngagementContractHandler: AppRouteHandler<typeof routes.updateEngagementContractRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  const contract = await engagementContractService.updateEngagementContract({ id, data: body }, ctx);
  return c.json(contract);
};

const updateEngagementContractStatusHandler: AppRouteHandler<
  typeof routes.updateEngagementContractStatusRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  const { status } = c.req.valid('json');

  if (status === 'sent') {
    const contract = await engagementContractService.sendEngagementContract({ id }, ctx);
    return c.json(contract);
  }

  if (status === 'accepted') {
    const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip');
    const contract = await engagementContractService.acceptEngagementContract({ id, clientIp }, ctx);
    return c.json(contract);
  }

  const contract = await engagementContractService.declineEngagementContract({ id }, ctx);
  return c.json(contract);
};

export const engagementContractHandlers = {
  createEngagementContractHandler,
  listEngagementContractsHandler,
  getEngagementContractHandler,
  updateEngagementContractHandler,
  updateEngagementContractStatusHandler,
};
