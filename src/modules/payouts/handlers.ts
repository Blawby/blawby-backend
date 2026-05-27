import type { routes } from '@/modules/payouts/routes';
import { serializePaginatedPayouts } from '@/modules/payouts/serializers/payout.serializer';
import { payoutsService } from '@/modules/payouts/services/payouts.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const listPayoutsHandler: AppRouteHandler<typeof routes.listPayoutsRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };
  const query = c.req.valid('query');

  const result = await payoutsService.listPayouts({ filters: query }, ctx);

  return c.json(serializePaginatedPayouts(result), 200);
};

const getPayoutHandler: AppRouteHandler<typeof routes.getPayoutRoute> = async (c) => {
  const { payout_id: id, practice_id: organizationId } = c.req.valid('param');
  const ctx = { ...getServiceContext(c), organizationId };

  const result = await payoutsService.getPayoutDetail({ id }, ctx);

  return c.json(result, 200);
};

export const handlers = {
  listPayoutsHandler,
  getPayoutHandler,
} as const;
