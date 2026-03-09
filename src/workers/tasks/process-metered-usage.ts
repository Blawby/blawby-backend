import type { Task } from 'graphile-worker';
import { METERED_TYPE_TO_STRIPE_EVENT } from '@/modules/subscriptions/constants/meteredProducts';
import { db } from '@/shared/database';
import { meteredProductsService } from '@/modules/subscriptions/services/meteredProducts.service';

export const processMeteredUsage: Task = async (payload, helpers): Promise<void> => {
  const {
    organizationId,
    meteredType,
    quantity,
    deduplicationId,
  } = (payload as {
    organizationId?: string;
    meteredType?: string;
    quantity?: number;
    deduplicationId?: string;
  }) || {};

  if (!organizationId || !meteredType || typeof quantity !== 'number' || !deduplicationId) {
    helpers.logger.error('Invalid metered usage retry payload', { payload });
    throw new Error('Invalid metered usage retry payload');
  }

  const res = await meteredProductsService.reportMeteredUsage(
    db,
    organizationId,
    meteredType as keyof typeof METERED_TYPE_TO_STRIPE_EVENT,
    quantity,
    deduplicationId,
  );

  if (!res.success) {
    throw new Error(res.error.message);
  }

  helpers.logger.info('Processed metered usage retry job {deduplicationId}', {
    organizationId,
    meteredType,
    deduplicationId,
  });
};
