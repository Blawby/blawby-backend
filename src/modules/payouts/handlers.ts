import type { routes } from '@/modules/payouts/routes';
import { serializePaginatedPayouts, serializePayoutDetail } from '@/modules/payouts/serializers/payout.serializer';
import { payoutsService } from '@/modules/payouts/services/payouts.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const listPayoutsHandler: AppRouteHandler<typeof routes.listPayoutsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const result = await payoutsService.listPayouts({ filters: query }, ctx);

  return c.json(serializePaginatedPayouts(result), 200);
};

const getPayoutHandler: AppRouteHandler<typeof routes.getPayoutRoute> = async (c) => {
  const { payout_id: id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const result = await payoutsService.getPayoutDetail({ id }, ctx);

  return c.json(serializePayoutDetail(result), 200);
};

export const handlers = {
  listPayoutsHandler,
  getPayoutHandler,
} as const;
