import { getLogger } from '@logtape/logtape';
import type { Task } from 'graphile-worker';
import { METERED_TYPE_TO_STRIPE_EVENT } from '@/modules/subscriptions/constants/meteredProducts';
import { meteredProductsService } from '@/modules/subscriptions/services/meteredProducts.service';
import { db } from '@/shared/database';

const logger = getLogger(['workers', 'process-metered-usage']);

const isKnownMeteredType = (value: string): value is keyof typeof METERED_TYPE_TO_STRIPE_EVENT =>
  Object.prototype.hasOwnProperty.call(METERED_TYPE_TO_STRIPE_EVENT, value);

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

  const res = await meteredProductsService.reportMeteredUsage(
    db,
    organizationId,
    meteredType,
    quantity,
    deduplicationId
  );

  if (!res.success) {
    throw new Error(res.error.message);
  }

  logger.info('Processed metered usage retry job {deduplicationId}', {
    organizationId,
    meteredType,
    deduplicationId,
  });
};
