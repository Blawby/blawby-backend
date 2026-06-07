import { getLogger } from '@logtape/logtape';
import type { Task } from 'graphile-worker';
import { METERED_TYPE_TO_STRIPE_EVENT } from '@/modules/subscriptions/constants/metered-products';
import { meteredProductsService } from '@/modules/subscriptions/services/metered-products.service';
import { db } from '@/shared/database';

const logger = getLogger(['workers', 'process-metered-usage']);

const isKnownMeteredType = (value: string): value is keyof typeof METERED_TYPE_TO_STRIPE_EVENT =>
  Object.hasOwn(METERED_TYPE_TO_STRIPE_EVENT, value);

export const processMeteredUsage: Task = async (payload): Promise<void> => {
  const { organizationId, meteredType, quantity, deduplicationId } =
    (payload as {
      organizationId?: string;
      meteredType?: string;
      quantity?: number;
      deduplicationId?: string;
    }) || {};

  if (
    !organizationId ||
    typeof meteredType !== 'string' ||
    !isKnownMeteredType(meteredType) ||
    typeof quantity !== 'number' ||
    !deduplicationId
  ) {
    logger.error('Invalid metered usage retry payload', { payload });
    throw new Error('Invalid metered usage retry payload');
  }

  await meteredProductsService.reportMeteredUsage(organizationId, meteredType, quantity, deduplicationId);

  logger.info('Processed metered usage retry job {deduplicationId}', {
    organizationId,
    meteredType,
    deduplicationId,
  });
};
