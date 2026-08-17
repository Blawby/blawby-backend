import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import { upsertDetailsTransaction } from '@/modules/practice/services/practice-management.helpers';
import { loadPracticeResponseById } from '@/modules/practice/services/practice-response.loader';
import type { DetailsData } from '@/modules/practice/types/practice-management.types';
import type { PracticeResponse } from '@/modules/practice/types/practice.types';
import { uow } from '@/shared/database/uow';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

const logger = getLogger(['practice', 'upsert-practice-details-operation']);

/**
 * Upsert practice details directly
 */
export const upsertPracticeDetails = async (
  { organizationId, data }: { organizationId: string; data: DetailsData },
  ctx: LegalOperationContext
): Promise<PracticeResponse> => {
  assertLegalOperationTenant(ctx, organizationId);

  if (!ctx.userId) {
    throw new HTTPException(403, { message: 'Practice details require a human actor' });
  }
  const { userId } = ctx;

  try {
    const organization = await organizationRepository.findById(organizationId);
    if (!organization) {
      throw new HTTPException(404, { message: `Organization not found for '${organizationId}'` });
    }

    const existing = await findPracticeDetailsByOrganization(organizationId);

    await uow.transaction(async () =>
      upsertDetailsTransaction(ctx, {
        organizationId,
        userId,
        data,
        existingAddressId: existing?.address_id,
        isCreate: !existing,
      })
    );

    const practice = await loadPracticeResponseById(organizationId);
    if (!practice) {
      throw new HTTPException(500, { message: 'Failed to load saved practice details' });
    }

    return practice;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to upsert practice details for {organizationId}: {error}', { organizationId, error });
    throw new HTTPException(500, { message: 'Failed to save practice details' });
  }
};
